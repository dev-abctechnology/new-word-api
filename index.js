// Codigo Atualizado 24/04/205
// Ezequiel 

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
require('dotenv').config();
const promClient = require('prom-client');
const expressMiddleware = require('express-prometheus-middleware');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const bodyParser = require('body-parser');
const Tesseract = require('tesseract.js');

const app = express();
const port = process.env.PORT || 4000;

let corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, process.env.UPLOAD_DIR || 'uploads/');
    },
    filename: (req, file, cb) => {
        const extensaoArquivo = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${extensaoArquivo}`);
    }
});

const upload = multer({ storage: storage });

const validarExtensaoArquivo = (arquivo) => {
    const extensoesPermitidas = ['.png', '.jpg', '.jpeg', '.jfif', '.pjpeg', '.pjp'];
    const extensaoArquivo = path.extname(arquivo.originalname).toLowerCase();
    return extensoesPermitidas.includes(extensaoArquivo);
};

// const pool = new Pool({
//     user: 'postgres',
//     host: 'db',
//     database: 'biblia',
//     password: 'postgres',
//     port: 5432,
// });

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'biblia',
    password: 'postgres',
    port: 5432,
});

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

            // Criar tabela word_status
            await client.query('CREATE TABLE IF NOT EXISTS word_status (id SERIAL PRIMARY KEY, word TEXT NOT NULL, status TEXT NOT NULL, user_id TEXT, date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
            console.log('Tabela word_status criada ou já existe.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao criar as tabelas:', err);
    }
};

// Função para registrar o status da palavra na tabela `word_status`
const registerWordStatus = async (word, status, userId) => {
    try {
        const client = await pool.connect();
        try {
            await client.query(
                'INSERT INTO word_status (word, status, user_id) VALUES ($1, $2, $3)',
                [word, status, userId]
            );
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao registrar o status da palavra:', err);
    }
};

// Função para atualizar o status de entrega na tabela `words`
const updateWordDeliveryStatus = async (word, userId) => {
    try {
        const client = await pool.connect();
        try {
            await client.query(
                'UPDATE words SET delivered = TRUE, who_delivered = $1, date_delivered = NOW() WHERE word = $2',
                [userId, word]
            );
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao atualizar o status de entrega da palavra:', err);
    }
};

// Rota para upload de imagens e processamento de OCR
app.post('/upload', upload.single('imagem'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
        }
        if (!validarExtensaoArquivo(req.file)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Extensão de arquivo inválida. São permitidos apenas arquivos PNG, JPG e JPEG.' });
        }

        let { texto, userId } = req.body;
        if (!texto || typeof texto !== 'string' || texto.length === 0 || texto.length > 100) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'O campo "texto" é obrigatório e deve ser uma string não vazia com no máximo 100 caracteres.' });
        }

        const { path: imagePath } = req.file;
        console.log(`Processando imagem: ${imagePath}`);

        const { data: { text } } = await Tesseract.recognize(
            imagePath,
            'por',
            { logger: m => console.log(`Tesseract: ${m}`) }
        );

        const palavraExtraida = text.trim();
        const coincidencia = palavraExtraida === texto.trim();

        console.log(`Processando imagem: ${imagePath}`);
        console.log(palavraExtraida);
        console.log(coincidencia);

        if (coincidencia) {
            console.log("A palavra é igual!");

            // Registrar a palavra como escrita na tabela `word_status`
            await registerWordStatus(texto, 'escrita', userId);

            // Atualizar status de entrega na tabela `words`
            await updateWordDeliveryStatus(texto, userId);

            return res.status(200).json({ message: 'A palavra coincide e foi marcada como escrita.', word: palavraExtraida, coincidencia: true });
        } else {
            // Registrar a palavra como não escrita na tabela `word_status`
            await registerWordStatus(texto, 'não escrita', userId);
        }

        fs.unlinkSync(imagePath);
        res.json({
            texto,
            textoExtraido: palavraExtraida,
            coincidencia
        });

    } catch (error) {
        console.error('Erro ao processar OCR:', error);
        if (error.code === 'ENOENT') {
            return res.status(400).json({ error: 'Arquivo de imagem não encontrado.' });
        }
        res.status(500).json({ error: 'Erro ao processar OCR.' });
    } finally {
        console.log('Processamento finalizado.');
    }
});

// const registerWordStatus = async (word, status, userId) => {
//     try {
//         const client = await pool.connect();
//         try {
//             await client.query('INSERT INTO word_status (word, status, user_id) VALUES ($1, $2, $3)', [word, status, userId]);
//         } finally {
//             client.release();
//         }
//     } catch (err) {
//         console.error('Erro ao registrar o status da palavra:', err);
//     }
// };

// app.post('/upload', upload.single('imagem'), async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
//         }
//         if (!validarExtensaoArquivo(req.file)) {
//             fs.unlinkSync(req.file.path);
//             return res.status(400).json({ error: 'Extensão de arquivo inválida. São permitidos apenas arquivos PNG, JPG e JPEG.' });
//         }

//         let { texto, userId } = req.body;
//         if (!texto) {
//             fs.unlinkSync(req.file.path);
//             return res.status(400).json({ error: 'O campo "texto" é obrigatório.' });
//         }
//         if (typeof texto !== 'string') {
//             fs.unlinkSync(req.file.path);
//             return res.status(400).json({ error: 'O campo "texto" deve ser uma string.' });
//         }
//         if (texto.length === 0) {
//             fs.unlinkSync(req.file.path);
//             return res.status(400).json({ error: 'O campo "texto" não pode ser vazio.' });
//         }
//         if (texto.length > 100) {
//             fs.unlinkSync(req.file.path);
//             return res.status(400).json({ error: 'O campo "texto" deve ter no máximo 100 caracteres.' });
//         }

//         const { path: imagePath } = req.file;
//         console.log(`Processando imagem: ${imagePath}`);

//         const { data: { text } } = await Tesseract.recognize(
//             imagePath,
//             'por',
//             { logger: m => console.log(`Tesseract: ${m}`) }
//         );

//         const palavraExtraida = text.trim();
//         const palavraOriginalMinuscula = texto.trim();
//         const coincidencia = palavraExtraida === palavraOriginalMinuscula;

//         if (coincidencia) {
//             console.log("A palavra é igual!");
//             console.log("Id do Usuario: ", userId);
//             console.log("Texto: ", texto);

//             const result = await pool.query(
//                 'SELECT * FROM words WHERE who_delivered = $1 AND word = $2 AND delivered = TRUE',
//                 [userId, texto]
//             );

//             if (result.rowCount > 0) {
//                 return res.status(400).json({ message: 'Você já preencheu esta palavra.' });
//             }

//             await pool.query(
//                 'UPDATE words SET delivered = TRUE, who_delivered = $1, date_delivered = NOW() WHERE word = $2',
//                 [userId, texto]
//             );

//             // Registrar a palavra como escrita
//             await registerWordStatus(texto, 'escrita', userId);

//             return res.status(200).json({ message: 'A palavra coincide e foi marcada como escrita.', word: palavraExtraida });
//         } else {
//             // Registrar a palavra como não escrita
//             await registerWordStatus(texto, 'não escrita', userId);
//         }

//         fs.unlinkSync(imagePath);

//         res.json({
//             texto,
//             textoExtraido: palavraExtraida,
//             coincidencia
//         });

//     } catch (error) {
//         console.error('Erro ao processar OCR:', error);
//         if (error.code === 'ENOENT') {
//             return res.status(400).json({ error: 'Arquivo de imagem não encontrado.' });
//         }
//         res.status(500).json({ error: 'Erro ao processar OCR.' });
//     } finally {
//         console.log('Processamento finalizado.');
//     }
// });

// função para listar palavras escritas e nao escritas
const listarPalavrasPorStatus = async () => {
    try {
        const client = await pool.connect();

        try {
            // Consultar palavras escritas
            const escritas = await client.query('SELECT word, user_id FROM word_status WHERE status = $1', ['escrita']);

            // Consultar palavras não escritas
            const naoEscritas = await client.query('SELECT word FROM words WHERE delivered = FALSE');

            return {
                escritas: escritas.rows,
                naoEscritas: naoEscritas.rows,
            };
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao listar palavras escritas e não escritas:', err);
        return { escritas: [], naoEscritas: [] };
    }
};

app.get('/list-word-status', async (req, res) => {
    const palavras = await listarPalavrasPorStatus();
    res.json(palavras);
});

app.post('/resetar-banco', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            resetDatabaseToInitialState();
            res.json({ mensagem: 'Banco de dados resetado com sucesso.' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao resetar o banco de dados:', err);
        res.status(500).json({ mensagem: 'Erro ao resetar o banco de dados.' });
    }
});

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

                return { hasWord: true, nextWord: null };
            }

            const result = await client.query(
                'SELECT word, id FROM words WHERE delivered = FALSE ORDER BY id ASC LIMIT 1'
            );
            if (result.rows.length > 0) {
                let word = result.rows[0].word;
                let id = result.rows[0].id;

                await client.query(
                    'UPDATE words SET delivered = TRUE, date_delivered = NOW(), who_delivered = $1 WHERE id = $2',
                    [userID, id]
                );
                return { hasWord: false, nextWord: { word, id } };
            } else {
                return { hasWord: false, nextWord: null };
            }
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao obter a próxima palavra:', err);
        return { hasWord: false, nextWord: null };
    }
};

app.get('/obter-palavra', async (req, res) => {

    const userID = req.query.userID;
    if (!userID) {
        res.status(400).json({ mensagem: 'O ID do usuário é obrigatório.' });
        return;
    }

    const { hasWord, nextWord } = await getNextWord(userID);

    if (hasWord) {
        res.status(400).json({ mensagem: 'Usuário já foi atrelado a uma palavra.' });
        return;
    }
    if (nextWord) {
        res.json(nextWord);
    } else {
        res.status(404).json({ mensagem: 'Não há mais palavras disponíveis.' });
    }
});

const resetDatabaseToInitialState = async () => {
    try {
        const client = await pool.connect();
        try {
            // Remover as referências de quem entregou as palavras
            await client.query('UPDATE words SET delivered = FALSE, date_delivered = NULL');

            // Zerar os dados da tabela word_status
            await client.query('DELETE FROM word_status');

        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao resetar o banco de dados para o estado inicial:', err);
    }
};

// Rota para servir arquivos estáticos (imagens)
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads/'));

// Configuração do Prometheus
const collectDefaultMetrics = promClient.collectDefaultMetrics;
const Registry = promClient.Registry;
const register = new Registry();
collectDefaultMetrics({ register });

const prometheusMiddleware = expressMiddleware({
    metricsPath: '/metrics',
    collectDefaultMetrics: true,
    registry: register,
});

app.use(prometheusMiddleware);

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
});
