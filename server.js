const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(express.json());

// Libera o CORS para que qualquer origem (inclusive o seu GitHub Pages) acesse o backend
app.use(cors());

// Rota 1: Autenticação Inicial (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { user, senha } = req.body;
        
        const response = await axios.post('https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken', {
            user,
            senha
        });
        
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({
            error: 'Erro ao conectar à API de Login da SED',
            details: error.message
        });
    }
});

// Rota 2: Obter Dados Escolares (Turma e Faltas combinados)
app.get('/api/dados-aluno', async (req, res) => {
    try {
        const { codigoAluno } = req.query;

        if (!codigoAluno) {
            return res.status(400).json({ error: 'O parâmetro codigoAluno é obrigatório' });
        }

        const urlTurma = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        const urlFaltas = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apiboletim/api/Frequencia/GetFaltasBimestreAtual?codigoAluno=${codigoAluno}`;

        // Executa as duas requisições em paralelo para poupar tempo
        const [resTurma, resFaltas] = await Promise.all([
            axios.get(urlTurma).catch(() => ({ data: null })),
            axios.get(urlFaltas).catch(() => ({ data: null }))
        ]);

        res.json({
            turma: resTurma.data,
            faltas: resFaltas.data
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar dados complementares do aluno', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando com sucesso na porta ${PORT}`));
