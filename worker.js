const { Pool } = require('pg');
require('dotenv').config();


const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
});

process.on('message', async (data) => {
  try {
    const { words, itemsPerTask, taskIndex } = data;
    const client = await pool.connect();
    try {
      for (let i = 0; i < words.length; i++) {
        let word = words[i];

        
        // Conecta palavras curtas
        const connectShortWords = (word, words, index) => {
            if (word.length <= 2) {
              const nextIndex = index + 1;
              const nextWord = words[nextIndex];
              if (nextWord.length <= 2) {
                const nextNextIndex = nextIndex + 1;
                const nextNextWord = words[nextNextIndex];
                if (nextNextWord.length <= 2) {
                  word = `${word} ${nextWord} ${nextNextWord}`;
                  index = nextNextIndex;
                } else {
                  word = `${word} ${nextWord}`;
                  index = nextIndex;
                }
              } else {
                word = `${word} ${nextWord}`;
                index = nextIndex;
              }
            }
            return { word, index };
          };
  
          connectionResult = connectShortWords(word, words, i);
          word = connectionResult.word;
          i = connectionResult.index;
  


        const index = i + taskIndex * itemsPerTask;
        const result = await client.query('INSERT INTO words (word, index, who_delivered) VALUES ($1, $2, $3)', [word, index, 'worker']);

        
        console.log(`Inserido: ${word}`);
        }
    } finally {
        client.release();
        }
    } catch (err) {
        console.error('Erro ao inserir palavras:', err);
    }
    process.send({ taskIndex });
}

)