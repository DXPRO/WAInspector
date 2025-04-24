# WAInspector

WAInspector é uma ferramenta avançada para inspeção das funcionalidades internas do WhatsApp Web. Este projeto permite explorar e interagir com módulos, eventos, funções e dados internos do WhatsApp de forma estruturada e amigável.

<p align="center">
  <img src="https://img.shields.io/badge/WhatsApp-Inspector-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WAInspector"/>
</p>

## Funcionalidades

- 🔍 **Exploração de Módulos**: Visualize e interaja com os módulos internos do WhatsApp
- 📡 **Captura de Eventos**: Monitore eventos em tempo real durante a utilização do WhatsApp Web
- ⚙️ **Acesso a Funções**: Visualize todas as funções disponíveis, incluindo parâmetros e detalhes
- 💾 **Visualização de Stores**: Veja dados de chats, contatos, mensagens e outras informações
- 🔬 **Inspeção Detalhada**: Navegue na estrutura interna do WhatsApp com visualização rica e interativa

## Screenshots

<p align="center">
  <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjXZ0bsG76tnL8Gv8lC_k2xcoUiotaXZsLRwiKeXQB5lwK5HE8P5ae8LLRy8ueuguRpaXShjA7rROrLsXWqKCAepgUYXWRXTuVquc1mylvwnJBIL2Oop7UFK_f7eO0WfZZUf5EWVU7SSrxgbeGAUwAMxOq4sPIIm93ykELDxHFugTmHHTOHe5ALI_Q16_Y/s1600/Screenshot_14.png" alt="Interface do WAInspector" width="600"/>
  
</p>

## Instalação

1. Clone este repositório:
   ```bash
   git clone https://github.com/DXPRO/WAInspector.git
   ```

2. Abra o arquivo `WAInspector.js` no seu editor.

## Como Usar

### Método 1: Console do Navegador

1. Abra o [WhatsApp Web](https://web.whatsapp.com/)
2. Instale e carregue o script do WPPConnect/WA-JS (veja abaixo)
3. Copie e cole o conteúdo do arquivo `WAInspector.js` no console do navegador
4. Execute o script

### Método 2: UserScript (Recomendado)

1. Instale uma extensão como [Tampermonkey](https://www.tampermonkey.net/) ou [Greasemonkey](https://www.greasespot.net/)
2. Crie um novo script e adicione o seguinte código:

```javascript
// ==UserScript==
// @name         WAInspector
// @namespace    http://seu-site.com/
// @version      1.0
// @description  Ferramenta avançada para inspeção do WhatsApp Web
// @author       Seu Nome
// @match        https://web.whatsapp.com/*
// @icon         https://www.google.com/s2/favicons?domain=whatsapp.com
// @require      https://github.com/wppconnect-team/wa-js/releases/download/v3.17.1/wppconnect-wa.js
// @grant        none
// ==/UserScript==

/* globals WPP */

(function() {
    'use strict';

    // Aguarde o WhatsApp ser carregado completamente
    WPP.webpack.onReady(function() {
        // Cole o conteúdo do WAInspector_Refatorado.js aqui
        // (async function() { ... })();
    });
})();
```

3. Cole o conteúdo do arquivo `WAInspector.js` no lugar indicado 
4. Salve o script e recarregue o WhatsApp Web

## ⚠️ Dependência Importante: WPPConnect/WA-JS

Para funcionamento completo, o WAInspector **necessita** do script `wppconnect-wa.js` do projeto [WPPConnect/WA-JS](https://github.com/wppconnect-team/wa-js).

Este script fornece acesso às funções internas do WhatsApp Web e deve ser carregado antes do WAInspector.

### Como integrar o WPPConnect/WA-JS:

1. Baixe a versão mais recente do script em:
   [https://github.com/wppconnect-team/wa-js/releases](https://github.com/wppconnect-team/wa-js/releases)

2. Se estiver usando UserScript (Tampermonkey/Greasemonkey), adicione a linha:
   ```
   @require https://github.com/wppconnect-team/wa-js/releases/download/v3.17.1/wppconnect-wa.js
   ```

3. Se estiver usando o console manualmente, carregue o script com:
   ```javascript
   var script = document.createElement('script');
   script.src = 'https://github.com/wppconnect-team/wa-js/releases/download/v3.17.1/wppconnect-wa.js';
   document.head.appendChild(script);
   
   script.onload = function() {
     // Cole o WAInspector_Refatorado.js aqui
   };
   ```

## Interface

A interface do WAInspector contém as seguintes abas:

- **Funções**: Lista todas as funções exportadas pelo WhatsApp
- **Importantes**: Módulos identificados como importantes para a operação do WhatsApp
- **Todos**: Lista completa de todos os módulos disponíveis
- **Namespace**: Acesso aos namespaces do WhatsApp Web
- **Eventos**: Captura eventos em tempo real durante a utilização

## Integração com WPP

O WAInspector trabalha perfeitamente com o WPPConnect/WA-JS e pode acessar todas as funcionalidades expostas pelo objeto `WPP`, incluindo:

```javascript
// Exemplos de funções disponíveis
WPP.chat.sendTextMessage(to, text);
WPP.chat.getChat(id);
WPP.contact.getContact(id);
WPP.group.getGroupInfo(id);
```

Consulte a [documentação do WPPConnect/WA-JS](https://wppconnect.io/wa-js/types/ev.EventTypes.html) para ver todas as funções e eventos disponíveis.

## Avisos de Segurança

- Este projeto é apenas para fins educacionais e de desenvolvimento
- Use responsavelmente e respeite os Termos de Serviço do WhatsApp
- O WAInspector inclui proteções contra códigos potencialmente perigosos

## Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## Licença

Este projeto está licenciado sob [MIT License](LICENSE).

## Agradecimentos

- [WPPConnect Team](https://github.com/wppconnect-team) pelo incrível trabalho no [WA-JS](https://github.com/wppconnect-team/wa-js)

---

**Nota**: Este projeto não é afiliado, associado, autorizado, endossado por, ou de qualquer forma oficialmente conectado com WhatsApp ou qualquer uma de suas subsidiárias ou afiliadas. 
