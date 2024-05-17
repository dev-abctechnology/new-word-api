const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 3000;

// Carrega o texto do livro da bíblia
const text = fs.readFileSync('biblia.txt', 'utf8');
// Separa as palavras do texto (utf8
const words = text.split(/\s+/);

// Caminho para o arquivo de palavras usadas
const usedWordsFile = 'used_words.json';

// Carrega as palavras usadas do arquivo (se ele existir)
let usedWords = new Set();
try {
  const data = fs.readFileSync(usedWordsFile, 'utf8');
  usedWords = new Set(JSON.parse(data));
} catch (err) {
  // Se o arquivo não existir, cria um novo conjunto vazio
  //console.error('Erro ao ler o arquivo de palavras usadas:', err);
}

app.use(bodyParser.json());

app.get('/api/obter-palavra', (req, res) => {
  let nextWord;
  let indexWord;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!usedWords.has(word)) {
      nextWord = word;
      indexWord = i;
      usedWords.add(word);
      break;
    }
  }

  if (nextWord) {
    // Salva as palavras usadas no arquivo
    fs.writeFileSync(usedWordsFile, JSON.stringify(Array.from(usedWords)));
    res.json({ palavra: nextWord, indice: indexWord });
  } else {
    res.json({ mensagem: 'Não há mais palavras disponíveis.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});