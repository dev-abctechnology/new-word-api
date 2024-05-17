const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
require('dotenv').config();

const app = express();
const port = 3000;

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
});

const textFile = 'biblia.txt';

const createTableWords = async () => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', ['words']);
      if (!result.rows[0].exists) {
        await client.query('CREATE TABLE words (id SERIAL PRIMARY KEY, word TEXT NOT NULL, index INT NOT NULL, delivered BOOLEAN DEFAULT FALSE, date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP, date_delivered TIMESTAMP, who_delivered TEXT NOT NULL)');
        console.log('Tabela words criada com sucesso!');
      } else {
        console.log('Tabela words já existe!');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro ao criar a tabela words:', err);
  }
};

const populateDatabase = async () => {
    try {
      const text = await readFileAsync(textFile, 'utf8');
      const words = text.toUpperCase().split(/\s+/); // Convert to uppercase
  
      const client = await pool.connect();
      try {
        for (let i = 0; i < words.length; i++) {
          await client.query('INSERT INTO words (word, index, who_delivered) VALUES ($1, $2, $3)', [words[i], i, 'SYSTEM']);
          let progress = Math.round((i + 1) / words.length * 100);
          console.log(`Progresso: ${progress}%`);
        }
      } finally {
        client.release();
      }
  
      console.log('Banco de dados populado com sucesso!');
    } catch (err) {
      console.error('Erro ao popular o banco de dados:', err);
    }
  };
  
  const getNextWord = async (userID) => {
    try {
      const client = await pool.connect();
      try {
        // Verifica se o usuário já foi atrelado a uma palavra
        const userHasWordResult = await client.query(
          'SELECT 1 FROM words WHERE who_delivered = $1 AND delivered = TRUE',
          [userID]
        );
        if (userHasWordResult.rows.length > 0) {
          // Usuário já foi atrelado a uma palavra, retornar null
          console.log(`Usuário ${userID} já foi atrelado a uma palavra.`);
          return null;
        }
  
        const result = await client.query(
          'SELECT word, index FROM words WHERE delivered = FALSE ORDER BY index ASC LIMIT 1'
        );
        if (result.rows.length > 0) {
          let word = result.rows[0].word;
          let index = result.rows[0].index;
  
          // Check for short words (in uppercase)
          if (word.length <= 2) {
            const nextResult = await client.query(
              'SELECT word FROM words WHERE index = $1',
              [index + 1]
            );
            if (nextResult.rows.length > 0) {
              const nextWord = nextResult.rows[0].word;
              word = `${word} ${nextWord}`;
              index += 1;
            }
          }
  
          // Check for "E A", "E O", etc. (in uppercase)
          if (word.startsWith('E ') && word.length > 4) {
            const nextResult = await client.query(
              'SELECT word FROM words WHERE index = $1',
              [index + 2]
            );
            if (nextResult.rows.length > 0) {
              const nextWord = nextResult.rows[0].word;
              word = `${word} ${nextWord}`;
              index += 2;
            }
          }
  
          await client.query(
            'UPDATE words SET delivered = TRUE, date_delivered = NOW(), who_delivered = $1 WHERE index <= $2',
            [userID, index]
          );
          return { word, index };
        } else {
          return null;
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Erro ao obter a próxima palavra:', err);
      return null;
    }
  };

app.get('/api/obter-palavra', async (req, res) => {
    
    const userID = req.query.userID;
    if (!userID) {
        res.status(400).json({ mensagem: 'O ID do usuário é obrigatório.' });
        return;
        }
        
  const nextWord = await getNextWord(userID);

  if (nextWord) {
    res.json(nextWord);
  } else {
    res.status(404).json({ mensagem: 'Não há mais palavras disponíveis.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

const waitUntilAvailable = async () => {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('Banco de dados disponível!');
      return;
    } catch (err) {
      console.error(`Banco de dados indisponível. Tentativa ${attempts + 1}/${maxAttempts}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  console.error('Tempo limite excedido. O banco de dados não está disponível.');
};

waitUntilAvailable().then(async () => {
 await createTableWords();
  //verify before populating
  pool.query('SELECT * FROM words')
      .then((res) => {
        if (res.rowCount === 0) {
          populateDatabase();
        }
        else{
            console.log('Banco de dados já populado!');
            //mostre os 10 primeiros registros

            pool.query('SELECT * FROM words ORDER BY index ASC LIMIT 10')
            .then((res) => {
              console.log(res.rows);
            })

        }
      })
      .catch((err) => {
        console.error('Erro ao verificar se o banco de dados está populado:', err);
      });
});