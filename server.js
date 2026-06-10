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

        // Validação básica antes de gastar processamento
        if (!user || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }
        
        // Faz o envio adicionando cabeçalhos comuns que evitam bloqueios de segurança (401/403)
        const response = await axios.post('https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken', 
        {
            user: String(user).trim(),  // Remove espaços extras acidentais
            senha: String(senha)
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Se a SED responder sucesso, repassamos os dados
        return res.json(response.data);

    } catch (error) {
        // Se a API da SED retornar um erro (como o 401), pegamos a resposta exata dela
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'A API da SED recusou as credenciais.',
                details: error.response.data || 'Usuário ou senha inválidos na base do governo.'
            });
        }

        return res.status(500).json({
            error: 'Erro interno ao tentar alcançar o servidor da SED',
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
