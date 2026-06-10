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

        if (!user || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        // Puxa a chave configurada na Environment Variable do Render
        const subKey = process.env.SED_SUBSCRIPTION_KEY;

        if (!subKey) {
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
                // Injeta a chave nos cabeçalhos padrões de API Gateways da Microsoft (Azure APIM)
                'Ocp-Apim-Subscription-Key': subKey,
                'Subscription-Key': subKey
            }
        });
        
        return res.json(response.data);

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'A API da SED recusou a requisição ou as credenciais.',
                details: error.response.data
            });
        }

        return res.status(500).json({
            error: 'Erro interno ao tentar alcançar o servidor da SED',
            details: error.message
        });
    }
});

// Rota 2: Obter Dados Escolares (Turma e Faltas combinados) - AGORA COM AUTH BEARER
app.get('/api/dados-aluno', async (req, res) => {
    try {
        const { codigoAluno } = req.query;
        let authHeader = req.headers.authorization;

        if (!codigoAluno) {
            return res.status(400).json({ error: 'O parâmetro codigoAluno é obrigatório' });
        }
        if (!authHeader) {
            return res.status(401).json({ error: 'O token é obrigatório' });
        }

        const subKey = process.env.SED_SUBSCRIPTION_KEY;
        
        // Limpa a palavra "Bearer " caso queiramos testar o token puro
        const tokenPuro = authHeader.replace(/^Bearer\s+/i, '');

        // Vamos montar os cabeçalhos tentando agradar o gateway da SED de todas as formas conhecidas
        const axiosConfig = {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Ocp-Apim-Subscription-Key': subKey,
                'Subscription-Key': subKey,
                
                // Formato 1: Bearer Token (padrão que você enviou)
                'Authorization': authHeader, 
                
                // Formato 2: Muitas APIs do Azure API Management usam uma destas chaves para o Token JWT puro
                'token': tokenPuro,
                'X-Authorization': tokenPuro
            }
        };

        const urlTurma = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        const urlFaltas = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apiboletim/api/Frequencia/GetFaltasBimestreAtual?codigoAluno=${codigoAluno}`;

        const [resTurma, resFaltas] = await Promise.all([
            axios.get(urlTurma, axiosConfig).catch((err) => {
                // Modificado para mostrar no log do Render se a SED respondeu alguma mensagem de erro explicativa
                console.error("Erro na rota de Turma:", err.response?.status, err.response?.data);
                return { data: null };
            }),
            axios.get(urlFaltas, axiosConfig).catch((err) => {
                console.error("Erro na rota de Faltas:", err.response?.status, err.response?.data);
                return { data: null };
            })
        ]);

        res.json({
            turma: resTurma.data,
            faltas: resFaltas.data
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
});

// CORREÇÃO AQUI: Garante que o Render use a porta padrão deles (10000) caso process.env.PORT falhe localmente
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
