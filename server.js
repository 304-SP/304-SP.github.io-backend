const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(express.json());

// Libera o CORS para que o seu GitHub Pages consiga fazer requisições sem bloqueios
app.use(cors());

// ==========================================
// ROTA 1: Autenticação Inicial (Login)
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { user, senha } = req.body;

        if (!user || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        const subKey = process.env.SED_SUBSCRIPTION_KEY;

        if (!subKey) {
            console.error("==> ERRO CRÍTICO: SED_SUBSCRIPTION_KEY não configurada!");
            return res.status(500).json({ 
                error: 'Configuração incompleta no servidor', 
                details: 'A variável de ambiente SED_SUBSCRIPTION_KEY não foi definida no painel do Render.' 
            });
        }

        const response = await axios.post('https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken', 
        {
            user: String(user).trim(),
            senha: String(senha)
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Ocp-Apim-Subscription-Key': subKey,
                'Subscription-Key': subKey,
                'Origin': 'https://saladofuturo.educacao.sp.gov.br',
                'Referer': 'https://saladofuturo.educacao.sp.gov.br/'
            }
        });
        
        return res.json(response.data);

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'A API da SED recusou as credenciais.',
                details: error.response.data
            });
        }
        return res.status(500).json({ error: 'Erro interno no servidor da SED', details: error.message });
    }
});

// ==========================================
// ROTA 2: Obter Dados Escolares (Turma e Faltas)
// ==========================================
app.get('/api/dados-aluno', async (req, res) => {
    try {
        let { codigoAluno } = req.query;
        let authHeader = req.headers.authorization;

        if (!codigoAluno) {
            return res.status(400).json({ error: 'O parâmetro codigoAluno é obrigatório' });
        }
        if (!authHeader) {
            return res.status(401).json({ error: 'O token de autorização é obrigatório' });
        }

        // Correção automática de 9 para 8 dígitos
        let codigoTratado = String(codigoAluno).trim();
        if (codigoTratado.length === 9) {
            codigoTratado = codigoTratado.slice(0, -1);
        }

        const subKey = process.env.SED_SUBSCRIPTION_KEY;

        // Cabeçalhos blindados e idênticos aos que saem do sistema oficial da SED
        const axiosConfig = {
            headers: {
                'Authorization': authHeader, // Formato puro "Bearer eyJ..." enviado pelo front
                'Ocp-Apim-Subscription-Key': subKey,
                'Subscription-Key': subKey,
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://saladofuturo.educacao.sp.gov.br',
                'Referer': 'https://saladofuturo.educacao.sp.gov.br/'
            }
        };

        const urlTurma = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoTratado}`;
        const urlFaltas = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apiboletim/api/Frequencia/GetFaltasBimestreAtual?codigoAluno=${codigoTratado}`;

        let detalheErroTurma = null;
        let detalheErroFaltas = null;

        const [resTurma, resFaltas] = await Promise.all([
            axios.get(urlTurma, axiosConfig).catch((err) => {
                detalheErroTurma = { status: err.response?.status, data: err.response?.data || err.message };
                console.error(`❌ ERRO TURMA:`, err.response?.status, err.response?.data || err.message);
                return { data: null };
            }),
            axios.get(urlFaltas, axiosConfig).catch((err) => {
                detalheErroFaltas = { status: err.response?.status, data: err.response?.data || err.message };
                console.error(`❌ ERRO FALTAS:`, err.response?.status, err.response?.data || err.message);
                return { data: null };
            })
        ]);

        if (resTurma.data === null && resFaltas.data === null) {
            return res.status(401).json({
                error: 'A API da SED recusou o acesso.',
                diagnostico: { erroRotaTurma: detalheErroTurma, erroRotaFaltas: detalheErroFaltas }
            });
        }

        res.json({
            turma: resTurma.data,
            faltas: resFaltas.data
        });

    } catch (error) {
        res.status(500).json({ error: 'Erro interno no proxy', details: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando com sucesso na porta ${PORT}`));
