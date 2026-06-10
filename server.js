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
            console.error("==> ERRO CRÍTICO: SED_SUBSCRIPTION_KEY não está configurada no Render!");
            return res.status(500).json({ 
                error: 'Configuração incompleta no servidor', 
                details: 'A variável de ambiente SED_SUBSCRIPTION_KEY não foi definida no painel do Render.' 
            });
        }
        
        console.log(`==> Tentativa de login iniciada para o usuário: ${user}`);

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
                'Subscription-Key': subKey
            }
        });
        
        console.log(`==> Login realizado com sucesso para o usuário: ${user}`);
        return res.json(response.data);

    } catch (error) {
        if (error.response) {
            console.error(`=> ERRO NO LOGIN (Status ${error.response.status}):`, JSON.stringify(error.response.data));
            return res.status(error.response.status).json({
                error: 'A API da SED recusou as credenciais.',
                details: error.response.data
            });
        }

        console.error("=> ERRO DE CONEXÃO NO LOGIN:", error.message);
        return res.status(500).json({
            error: 'Erro interno ao tentar alcançar o servidor da SED',
            details: error.message
        });
    }
});

// ==========================================
// ROTA 2: Obter Dados Escolares (Turma e Faltas)
// ==========================================
app.get('/api/dados-aluno', async (req, res) => {
    try {
        const { codigoAluno } = req.query;
        let authHeader = req.headers.authorization;

        console.log(`\n--- NOVA REQUISIÇÃO DE DADOS ESCOLARES ---`);
        console.log(`=> Código do Aluno recebido: ${codigoAluno}`);
        console.log(`=> Cabeçalho Authorization recebido: ${authHeader ? "SIM (Enviado)" : "NÃO (Ausente)"}`);

        if (!codigoAluno) {
            return res.status(400).json({ error: 'O parâmetro codigoAluno é obrigatório' });
        }
        if (!authHeader) {
            return res.status(401).json({ error: 'O token de autorização (Authorization Header) é obrigatório' });
        }

        const subKey = process.env.SED_SUBSCRIPTION_KEY;
        const tokenPuro = authHeader.replace(/^Bearer\s+/i, '');

        // Montamos um objeto de cabeçalhos completo contendo todas as variações para o Gateway aceitar
        const axiosConfig = {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Ocp-Apim-Subscription-Key': subKey,
                'Subscription-Key': subKey,
                'Authorization': authHeader, // Formato Padrão: "Bearer eyJ..."
                'token': tokenPuro,          // Formato alternativo para chaves JWT puras
                'X-Authorization': tokenPuro
            }
        };

        const urlTurma = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        const urlFaltas = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apiboletim/api/Frequencia/GetFaltasBimestreAtual?codigoAluno=${codigoAluno}`;

        // Armazenamos os erros reais aqui caso aconteçam para responder ao frontend
        let detalheErroTurma = null;
        let detalheErroFaltas = null;

        const [resTurma, resFaltas] = await Promise.all([
            axios.get(urlTurma, axiosConfig).catch((err) => {
                // Captura e formata a resposta exata do servidor do governo
                const respostaErro = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                detalheErroTurma = { status: err.response?.status, data: err.response?.data || err.message };
                
                console.error(`❌ DETALHE ERRO TURMA (Status ${err.response?.status}):`, respostaErro);
                return { data: null };
            }),
            axios.get(urlFaltas, axiosConfig).catch((err) => {
                const respostaErro = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                detalheErroFaltas = { status: err.response?.status, data: err.response?.data || err.message };
                
                console.error(`❌ DETALHE ERRO FALTAS (Status ${err.response?.status}):`, respostaErro);
                return { data: null };
            })
        ]);

        // Se ambas as rotas falharem por falta de autorização (401), avisamos o front com detalhes
        if (resTurma.data === null && resFaltas.data === null) {
            return res.status(401).json({
                error: 'A API da SED recusou o acesso aos dados escolares (Não Autorizado).',
                diagnostico: {
                    erroRotaTurma: detalheErroTurma,
                    erroRotaFaltas: detalheErroFaltas
                }
            });
        }

        // Se pelo menos uma der certo, retorna o que conseguiu
        res.json({
            turma: resTurma.data,
            faltas: resFaltas.data
        });

    } catch (error) {
        console.error("=> ERRO INTERNO DO SERVIDOR PROXY:", error.message);
        res.status(500).json({ error: 'Erro interno no proxy', details: error.message });
    }
});

// Garante que o Render faça a vinculação da porta (Port Binding) corretamente na porta 10000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
