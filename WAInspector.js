(async function() {
  'use strict';
  
  // ============================================================
  // MÓDULO: Core - Configuração e Utilitários Básicos
  // ============================================================
  const WAInspector = {
    config: {
      version: '3.1',
      licenseeName: 'Usuário WAInspector',
      isLicensed: true
    },
    
    data: {
      whatsappVersion: window.Debug?.VERSION || 'desconhecido',
      functions: {},
      moduleMap: { importantModules: {} },
      allModules: {},
      namespaceModules: {},
      events: []
    },
    
    modules: {},
    
    utils: {
      sanitizeHTML(str) {
        if (str === undefined || str === null) return '';
        if (typeof str !== 'string') str = String(str);
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
      },
      
      createSafeElement(tag, attributes = {}, textContent = null) {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
          if (key.startsWith('on')) continue; // Ignorar atributos de eventos
          element.setAttribute(key, value);
        }
        if (textContent !== null) {
          element.textContent = textContent;
        }
        return element;
      },
      
      getParams(fn) {
        try {
          if (typeof fn !== 'function') return [];
          const src = fn.toString();
          const m = src.match(/^[^\(]*\(\s*([^\)]*)\)/) || [];
          if (!m[1]) return [];
          return m[1].split(',').map(p => p.trim()).filter(Boolean);
        } catch (err) {
          console.warn("Erro ao extrair parâmetros:", err);
          return [];
        }
      },
      
      async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    }
  };
  
  // Log informativo inicial
  console.log(`WAInspector v${WAInspector.config.version}: Ativado para '${WAInspector.config.licenseeName}'`);
  
  // ============================================================
  // MÓDULO: WebpackAccess - Acesso aos módulos internos
  // ============================================================
  WAInspector.modules.webpack = {
    wpRequire: null,
    
    async getWebpackRequire() {
      try {
        // Priorizar WPP se disponível
        if (window.WPP?.webpack?.webpackRequire) return window.WPP.webpack.webpackRequire;
        
        // Fallback direto ao webpack
        return new Promise(resolve => {
          try {
            const fakeId = 'wainspector_' + Date.now();
            // Obter acesso direto aos módulos do WhatsApp Web
            if (window.webpackChunkwhatsapp_web_client) {
              window.webpackChunkwhatsapp_web_client.push([
                [fakeId], {}, function(require) {
                  resolve(require);
                }
              ]);
            } else if (window.webpackChunkbuild) {
              window.webpackChunkbuild.push([
                [fakeId], {}, function(require) {
                  resolve(require);
                }
              ]);
            } else {
              console.warn("Não foi possível acessar os chunks do webpack");
              resolve(null);
            }
          } catch (err) {
            console.warn("Erro ao acessar módulos webpack:", err);
            resolve(null);
          }
        });
      } catch (err) {
        console.warn("Erro ao obter webpackRequire:", err);
        return null;
      }
    },
    
    secureRequire(moduleId) {
      try {
        // Verificação de segurança robusta
        if (!moduleId || typeof moduleId !== 'string' && typeof moduleId !== 'number') {
          console.warn('Tentativa de acessar módulo com ID inválido');
          return null;
        }
        
        // Verificar se o wpRequire está disponível
        if (!this.wpRequire || !this.wpRequire.m) {
          console.warn('Webpack require não está disponível');
          return null;
        }
        
        // Verificar se o módulo existe
        const moduleFactory = this.wpRequire.m[moduleId];
        if (!moduleFactory) {
          console.warn(`Módulo ${moduleId} não encontrado`);
          return null;
        }
        
        // Lista de termos perigosos para verificar no código fonte
        const dangerousTerms = [
          'document.cookie', 
          'localStorage', 
          'sessionStorage',
          'XMLHttpRequest',
          'fetch(',
          'eval(',
          'Function(',
          'document.write',
          'document.location',
          'window.location'
        ];
        
        // Verificar código fonte por padrões perigosos
        const moduleSource = moduleFactory.toString();
        const containsDangerousCode = dangerousTerms.some(term => moduleSource.includes(term));
        
        if (containsDangerousCode) {
          console.warn(`Módulo ${moduleId} bloqueado por conter código potencialmente perigoso`);
          return { __blocked: true, reason: 'Código potencialmente perigoso detectado' };
        }
        
        // Carrega o módulo em uma estrutura controlada
        try {
          const module = this.wpRequire(moduleId);
          
          // Verificação adicional para não expor APIs sensíveis
          if (module && typeof module === 'object') {
            const sensitivePropNames = [
              'document', 'window', 'location', 'navigator', 'localStorage',
              'sessionStorage', 'indexedDB', 'cookie', 'history'
            ];
            
            for (const prop of sensitivePropNames) {
              if (Object.prototype.hasOwnProperty.call(module, prop)) {
                console.warn(`Módulo ${moduleId} bloqueado por expor API sensível: ${prop}`);
                return { __blocked: true, reason: `Exposição de API sensível: ${prop}` };
              }
            }
          }
          
          return module;
        } catch (loadErr) {
          console.error(`Erro ao carregar módulo ${moduleId}:`, loadErr);
          return { __blocked: true, reason: `Erro ao carregar: ${loadErr.message}` };
        }
      } catch (err) {
        console.error(`Erro ao processar módulo ${moduleId} de forma segura:`, err);
        return null;
      }
    },
    
    init: async function() {
      this.wpRequire = await this.getWebpackRequire();
      return this.wpRequire;
    }
  };
  
  // ============================================================
  // MÓDULO: EventCapture - Captura de eventos do WhatsApp
  // ============================================================
  WAInspector.modules.events = {
    ui: null, // Referência ao módulo UI (será configurado posteriormente)
    
    initEventCapture() {
      try {
        window.EVENTOS = WAInspector.data.events;
        
        if (!window.WPP?.onAny) {
          console.log("WPP.onAny não disponível, monitoramento de eventos WPP desativado");
          
          // Se não temos WPP, vamos tentar monitorar eventos do WhatsApp diretamente
          try {
            // Adicionar evento para simular a captura
            const testEvent = {
              event: "whatsapp.loaded", 
              value: { message: "WAInspector inicializado sem WPP" },
              timestamp: new Date().toISOString(),
              formattedTime: new Date().toLocaleTimeString()
            };
            WAInspector.data.events.push(testEvent);
            
            console.log("Monitoramento alternativo de eventos ativado");
            
            // Monitorar mudanças no DOM que possam indicar eventos
            const observer = new MutationObserver((mutations) => {
              // Simplificado - apenas reporta mudanças na interface
              const eventData = { 
                event: "dom.changed", 
                value: { mutations: mutations.length },
                timestamp: new Date().toISOString(),
                formattedTime: new Date().toLocaleTimeString()
              };
              WAInspector.data.events.push(eventData);
              
              // Atualizar contador e interface se disponível
              this.updateEventCounter();
              this.addEventToList(eventData, WAInspector.data.events.length - 1);
            });
            
            // Observar mudanças na app principal do WhatsApp
            const appElement = document.getElementById('app') || document.body;
            observer.observe(appElement, { 
              childList: true,
              subtree: true,
              attributes: false
            });
          } catch (altErr) {
            console.warn("Erro ao configurar captura alternativa:", altErr);
          }
          return;
        }
        
        // Método padrão usando WPP
        window.WPP.onAny((event, value) => {
          try {
            const eventData = { 
              event, 
              value, 
              timestamp: new Date().toISOString(),
              formattedTime: new Date().toLocaleTimeString()
            };
            WAInspector.data.events.push(eventData);
            
            // Atualizar contador e interface se disponível
            this.updateEventCounter();
            this.addEventToList(eventData, WAInspector.data.events.length - 1);
          } catch (err) {
            console.warn("Erro ao processar evento:", err);
          }
        });
      } catch (mainErr) {
        console.error("Erro crítico ao configurar captura de eventos:", mainErr);
      }
    },
    
    updateEventCounter() {
      try {
        const countBadge = document.querySelector("#waInspectorTabs button[data-tab='events'] .count");
        if (countBadge) {
          countBadge.textContent = WAInspector.data.events.length;
        }
      } catch (err) {
        console.warn("Erro ao atualizar contador de eventos:", err);
      }
    },
    
    addEventToList(eventData, index) {
      try {
        // Verificar se o módulo UI está disponível
        if (!this.ui) return;
        
        // Atualiza lista se estiver ativa
        const list = document.getElementById('listEvents');
        if (!list) return;
        
        // Criação segura de elementos
        const li = WAInspector.utils.createSafeElement('li');
        li.dataset.eventIndex = index;
        
        const eventTime = WAInspector.utils.createSafeElement(
          'span', 
          { className: 'event-time' }, 
          eventData.formattedTime
        );
        
        const eventName = WAInspector.utils.createSafeElement(
          'span', 
          { className: 'event-name' }, 
          eventData.event
        );
        
        li.appendChild(eventTime);
        li.appendChild(eventName);
        li.title = typeof eventData.value === 'object' 
          ? 'Clique para ver detalhes' 
          : String(eventData.value).substring(0, 100);
        
        // Adicionar um indicador de conteúdo de forma segura
        if (typeof eventData.value === 'object' && eventData.value !== null) {
          const indicator = WAInspector.utils.createSafeElement(
            'span', 
            { className: 'content-indicator', title: 'Contém dados JSON' }, 
            '🔍'
          );
          li.appendChild(indicator);
        }
        
        // Adicionar evento de clique
        li.addEventListener('click', () => {
          try {
            // Remover seleção de outros itens
            list.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
            // Adicionar seleção ao item clicado
            li.classList.add('selected');
            
            // Buscar evento e detalhes
            const event = WAInspector.data.events[index];
            if (!event) return;
            
            // Mostrar detalhes no painel lateral
            this.showEventDetails(event);
          } catch (clickErr) {
            console.warn("Erro ao processar clique no evento:", clickErr);
          }
        });
        
        list.prepend(li); // Adiciona no início para mostrar os mais recentes primeiro
        
        // Se a lista ficar muito grande, remover itens antigos para evitar sobrecarga
        const maxEvents = 100;
        const items = list.querySelectorAll('li');
        if (items.length > maxEvents) {
          for (let i = maxEvents; i < items.length; i++) {
            items[i].remove();
          }
        }
      } catch (err) {
        console.warn("Erro ao adicionar evento à lista:", err);
      }
    },
    
    showEventDetails(event) {
      try {
        const detailInfo = document.querySelector('#waDetailInfo');
        const eventDetail = document.querySelector('#waEventDetail');
        if (!detailInfo || !eventDetail) return;
        
        // Iniciar grupo de console
        console.group(`🔍 WAInspector - Evento: ${event.event}`);
        console.log('Nome do evento:', event.event);
        console.log('Timestamp:', event.timestamp);
        console.log('Horário formatado:', event.formattedTime);
        
        // Mostrar valor completo com exploração detalhada
        console.log('Valor do evento:', event.value);
        
        // Explorar mais profundamente se for um objeto
        if (typeof event.value === 'object' && event.value !== null) {
          console.log('Propriedades do valor:', Object.keys(event.value));
          
          // Tentar encontrar IDs, números de telefone ou outras informações úteis
          const serialized = JSON.stringify(event.value);
          
          // Procurar potenciais IDs de mensagens ou chats
          const idMatch = serialized.match(/"id":["']([^"']+)["']/g);
          if (idMatch) {
            console.log('IDs encontrados:', idMatch);
          }
          
          // Procurar possíveis números de telefone
          const phoneMatch = serialized.match(/\d{10,15}/g);
          if (phoneMatch) {
            console.log('Possíveis números de telefone:', phoneMatch);
          }
          
          // Verificar se há callbacks ou funções
          Object.entries(event.value).forEach(([key, val]) => {
            if (typeof val === 'function') {
              console.log(`Função ${key}:`, val);
              console.log(`Assinatura de ${key}:`, WAInspector.utils.getParams(val).join(', '));
            }
          });
        }
        
        // Adicionar código para ouvir este evento no console
        console.log(`Para monitorar este evento, use: window.WPP.on('${event.event}', (data) => console.log('Evento capturado:', data));`);
        
        // Finalizar grupo
        console.groupEnd();
        
        // Interface
        let detailHtml = `<strong>Evento</strong>: ${WAInspector.utils.sanitizeHTML(event.event)}<br>`;
        detailHtml += `<strong>Timestamp</strong>: ${WAInspector.utils.sanitizeHTML(event.timestamp || 'N/A')}<br>`;
        detailHtml += `<strong>Horário</strong>: ${WAInspector.utils.sanitizeHTML(event.formattedTime || 'N/A')}<br>`;
        detailHtml += `<button id="waEventCopy" class="wa-button">Copiar código para monitorar</button>`;
        
        detailInfo.innerHTML = detailHtml;
        
        // Adicionar listener para o botão de copiar código
        document.getElementById('waEventCopy')?.addEventListener('click', () => {
          try {
            const codeText = `window.WPP.on('${event.event}', (data) => console.log('Evento ${event.event} capturado:', data));`;
            navigator.clipboard.writeText(codeText).then(() => {
              document.getElementById('waEventCopy').textContent = '✓ Código copiado!';
              setTimeout(() => {
                const btn = document.getElementById('waEventCopy');
                if (btn) btn.textContent = 'Copiar código para monitorar';
              }, 2000);
            });
          } catch (clipErr) {
            console.warn("Erro ao copiar para área de transferência:", clipErr);
          }
        });
        
        try {
          // Criar visualizador interativo em vez de apenas JSON formatado
          const jsonViewer = WAInspector.modules.ui.createInteractiveViewer(event.value);
          eventDetail.innerHTML = `<strong>Valor</strong>:<br>`;
          eventDetail.appendChild(jsonViewer);
          eventDetail.classList.add('visible');
        } catch (formatErr) {
          console.warn("Erro ao formatar valor do evento:", formatErr);
          eventDetail.innerHTML = `<strong>Valor</strong>:<br><span class="wa-error">Erro ao formatar dados: ${WAInspector.utils.sanitizeHTML(formatErr.message)}</span>`;
          eventDetail.classList.add('visible');
        }
      } catch (err) {
        console.warn("Erro ao mostrar detalhes do evento:", err);
        if (WAInspector.modules.ui) {
          WAInspector.modules.ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
        }
      }
    },
    
    init: function(ui) {
      this.ui = ui;
      this.initEventCapture();
    }
  };
  
  // ============================================================
  // MÓDULO: Discovery - Descoberta de funções e módulos
  // ============================================================
  WAInspector.modules.discovery = {
    discoverFunctions() {
      try {
        if (!window.WPP) {
          console.log("WPP não encontrado. Utilizando acesso direto aos módulos do WhatsApp.");
          // Adicionar algumas funções simuladas para informar o usuário
          WAInspector.data.functions["whatsapp.webpack.get"] = { module: "webpack", name: "get", directAccess: true };
          WAInspector.data.functions["whatsapp.webpack.find"] = { module: "webpack", name: "find", directAccess: true };
          return;
        }
        
        for (const ns of Object.keys(window.WPP)) {
          try {
            const obj = window.WPP[ns];
            if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) continue;
            
            for (const fnName of Object.getOwnPropertyNames(obj)) {
              try {
                if (typeof obj[fnName] === 'function') {
                  WAInspector.data.functions[`${ns}.${fnName}`] = { module: ns, name: fnName };
                }
              } catch (err) {
                console.warn(`Erro ao processar função ${ns}.${fnName}:`, err);
              }
            }
          } catch (nsErr) {
            console.warn(`Erro ao processar namespace ${ns}:`, nsErr);
          }
        }
      } catch (mainErr) {
        console.error("Erro crítico ao descobrir funções:", mainErr);
      }
    },
    
    async mapWebappStructure() {
      try {
        const wpRequire = WAInspector.modules.webpack.wpRequire;
        if (!wpRequire || !wpRequire.m) {
          console.warn("Webpack require não disponível ou incompleto");
          return;
        }
        
        const factories = wpRequire.m || {};
        for (const [id, factory] of Object.entries(factories)) {
          try {
            if (!factory) continue;
            const name = factory?.name || `module_${id}`;
            WAInspector.data.allModules[id] = { id, name };
            const src = factory?.toString?.() || '';
            if (/Model|Store|Collection/.test(src)) {
              WAInspector.data.moduleMap.importantModules[id] = { id, name };
            }
          } catch (err) {
            console.warn(`Erro ao processar módulo #${id}:`, err);
          }
        }
        
        // Processar namespaces apenas se WPP estiver disponível
        if (!window.WPP?.whatsapp) {
          console.log("WPP.whatsapp não disponível. Tentando encontrar módulos importantes diretamente.");
          // Buscar módulos importantes diretamente via webpack
          try {
            // Identificar módulos pelo seu conteúdo
            for (const [id, factory] of Object.entries(factories)) {
              try {
                if (!factory) continue;
                const src = factory?.toString?.() || '';
                
                if (src.includes('Chat') || src.includes('Message') || src.includes('Conn')) {
                  const pseudoName = src.includes('Chat') ? 'ChatModule' : 
                                    src.includes('Message') ? 'MessageModule' : 'ConnModule';
                  
                  try {
                    const module = WAInspector.modules.webpack.secureRequire(id);
                    if (module && !module.__blocked) {
                      const members = Object.keys(module);
                      WAInspector.data.namespaceModules[pseudoName] = { 
                        name: pseudoName, 
                        members, 
                        directAccess: true 
                      };
                    }
                  } catch (reqErr) {
                    console.warn(`Erro ao carregar módulo importante #${id}:`, reqErr);
                  }
                }
              } catch (modErr) {
                console.warn(`Erro ao analisar módulo #${id}:`, modErr);
              }
            }
          } catch (directErr) {
            console.warn("Erro ao buscar módulos importantes diretamente:", directErr);
          }
          return;
        }
        
        // Processar namespaces WPP normalmente
        for (const [name, obj] of Object.entries(window.WPP?.whatsapp || {})) {
          try {
            if (!obj) continue;
            let members = [];
            try { members = Object.getOwnPropertyNames(obj); } catch {}
            WAInspector.data.namespaceModules[name] = { name, members };
          } catch (err) {
            console.warn(`Erro ao processar namespace ${name}:`, err);
          }
        }
      } catch (mainErr) {
        console.error("Erro crítico ao mapear estrutura:", mainErr);
      }
    },
    
    init: async function() {
      this.discoverFunctions();
      await this.mapWebappStructure();
    }
  };

  // ============================================================
  // MÓDULO: Stores - Processamento das stores do WhatsApp
  // ============================================================
  async function processWhatsAppStores() {
    try {
      console.log("Buscando e processando stores do WhatsApp...");
      const storeModules = {
        chat: null,
        contact: null,
        message: null,
        connection: null,
        group: null,
        presence: null,
        status: null,
        call: null,
        // Armazenar módulos detectados
        modules: {},
        // Armazenar dados em tempo real
        data: {},
        // Função para atualizar dados
        update: async function() {
          try {
            // Atualizar dados das stores
            if (this.chat && this.chat.Chat) {
              this.data.chats = Object.values(this.chat.Chat.models || {}).map(chat => ({
                id: chat.id,
                name: chat.formattedTitle,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                timestamp: chat.t,
                muteExpiration: chat.muteExpiration
              }));
            }
            
            if (this.contact && this.contact.Contact) {
              this.data.contacts = Object.values(this.contact.Contact.models || {}).map(contact => ({
                id: contact.id,
                name: contact.name,
                pushname: contact.pushname,
                shortName: contact.shortName,
                type: contact.type,
                verified: contact.verified
              }));
            }
            
            if (this.message && this.message.Msg) {
              // Pegar apenas mensagens recentes para evitar sobrecarga
              const recentMessages = Object.values(this.message.Msg.models || {})
                .sort((a, b) => (b.t || 0) - (a.t || 0))
                .slice(0, 20);
                
              this.data.messages = recentMessages.map(msg => ({
                id: msg.id,
                body: msg.body,
                type: msg.type,
                isForwarded: msg.isForwarded,
                isStatus: msg.isStatus,
                timestamp: msg.t,
                from: msg.from,
                to: msg.to,
                author: msg.author
              }));
            }
            
            if (this.connection) {
              this.data.connection = {
                state: this.connection.state || 'unknown',
                isConnected: !!(this.connection.connected || this.connection.state === 'CONNECTED'),
                isLoggedIn: !!(this.connection.authenticated || this.connection.state === 'AUTHENTICATED'),
                phoneConnected: !!(this.connection.phoneConnected),
                lastSeen: this.connection.lastSeen
              };
            }
            
            if (this.presence) {
              this.data.presence = {
                participantsList: Object.keys(this.presence.participants || {}),
                chatStates: Object.entries(this.presence.chatstate || {}).map(([id, state]) => ({
                  id,
                  state
                }))
              };
            }
            
            if (this.group && this.group.GroupMetadata) {
              this.data.groups = Object.values(this.group.GroupMetadata.models || {}).map(group => ({
                id: group.id,
                subject: group.subject,
                creation: group.creation,
                owner: group.owner,
                participants: (group.participants || []).map(p => ({
                  id: p.id,
                  isAdmin: p.isAdmin,
                  isSuperAdmin: p.isSuperAdmin
                }))
              }));
            }
            
            return this.data;
          } catch (err) {
            console.error("Erro ao atualizar dados das stores:", err);
            return null;
          }
        }
      };
      
      // Detectar através de diferentes abordagens dependendo da disponibilidade
      if (window.WPP && window.WPP.whatsapp) {
        // Abordagem via WPP
        console.log("Detectando stores via WPP...");
        
        if (window.WPP.whatsapp.models) {
          const models = window.WPP.whatsapp.models;
          // Armazenar para futuro acesso
          storeModules.modules.wpp = models;
          
          storeModules.chat = models.ChatStore || models.Chat;
          storeModules.contact = models.ContactStore || models.Contact;
          storeModules.message = models.MsgStore || models.Msg;
          storeModules.connection = models.ConnStore || models.Conn;
          storeModules.presence = models.PresenceStore || models.Presence;
          storeModules.group = models.GroupMetadataStore || models.GroupMetadata;
          storeModules.status = models.StatusStore || models.Status;
          storeModules.call = models.CallStore || models.Call;
        }
      } else {
        // Abordagem direta via webpack
        console.log("Detectando stores via webpack...");
        
        const wpRequire = WAInspector.modules.webpack.wpRequire;
        // Buscar módulos por palavras-chave
        const potentialStoreModules = [];
        for (const [id, factory] of Object.entries(wpRequire.m || {})) {
          try {
            if (!factory) continue;
            const src = factory.toString();
            if (/(Chat|Contact|Conn|Message|Msg|GroupMetadata|Status|Call).*Store/.test(src)) {
              const module = WAInspector.modules.webpack.secureRequire(id);
              if (module && !module.__blocked) {
                potentialStoreModules.push({ id, module });
              }
            }
          } catch (err) {
            console.warn(`Erro ao analisar módulo #${id} para store:`, err);
          }
        }
        
        console.log(`Encontrados ${potentialStoreModules.length} potenciais módulos de store`);
        
        // Armazenar para futuro acesso
        storeModules.modules.webpack = potentialStoreModules;
        
        // Analisar módulos encontrados
        for (const { id, module } of potentialStoreModules) {
          try {
            // Verificar cada módulo por características de diferentes stores
            
            // Chat Store
            if (module.Chat && module.Chat.models) {
              storeModules.chat = module;
            }
            // Contact Store
            else if (module.Contact && module.Contact.models) {
              storeModules.contact = module;
            }
            // Message Store
            else if (module.Msg && module.Msg.models) {
              storeModules.message = module;
            }
            // Connection Store
            else if (module.Conn || (module.default && (module.default.state || module.default.connection))) {
              storeModules.connection = module.Conn || module.default;
            }
            // Group Store
            else if (module.GroupMetadata && module.GroupMetadata.models) {
              storeModules.group = module;
            }
            // Presence Store
            else if (module.Presence || (module.default && module.default.participants)) {
              storeModules.presence = module.Presence || module.default;
            }
            // Status Store
            else if (module.Status && module.Status.models) {
              storeModules.status = module;
            }
            // Call Store
            else if (module.Call && module.Call.models) {
              storeModules.call = module;
            }
          } catch (err) {
            console.warn(`Erro ao processar módulo de store #${id}:`, err);
          }
        }
      }
      
      // Log de resultados
      const foundStores = Object.entries(storeModules)
        .filter(([key, value]) => !['modules', 'data', 'update'].includes(key) && value !== null)
        .map(([key]) => key);
        
      console.log(`Stores detectadas (${foundStores.length}): ${foundStores.join(', ')}`);
      
      // Inicializar dados
      await storeModules.update();
      
      return storeModules;
    } catch (err) {
      console.error("Erro durante processamento de stores:", err);
      return {
        modules: {},
        data: {},
        update: () => ({ error: "Falha ao processar stores" })
      };
    }
  }

  // ============================================================
  // MÓDULO: UI - Interface de Usuário
  // ============================================================
  
  // Função principal para criar a interface do usuário
  function createUI(storeModules) {
    try {
      // Remove instâncias anteriores, se existirem
      document.getElementById('waInspectorPanel')?.remove();
      
      // Adicionar estilos
      addStyles();
      
      // Criar componentes principais da UI
      const panel = createBasePanel();
      
      // Inicializar recursos da UI
      const ui = {
        // Referência ao painel principal
        panel,
        
        // Referência às stores
        storeModules,
        
        // Função para mostrar erros
        showError(message) {
          try {
            const detailPane = document.querySelector('#waDetailPane');
            const detailInfo = document.querySelector('#waDetailInfo');
            if (detailInfo) {
              detailInfo.innerHTML = `<div class="wa-error">${WAInspector.utils.sanitizeHTML(message)}</div>`;
            }
          } catch (err) {
            console.error("Erro ao mostrar mensagem de erro:", err);
          }
        },
        
        // Função para visualizar objetos de forma interativa
        createInteractiveViewer(obj, maxDepth = 3, expandedPaths = new Set()) {
          return createInteractiveViewer(obj, maxDepth, expandedPaths);
        }
      };
      
      // Inicializar tabs e conteúdo
      initializeTabs(ui);
      
      // Popular dados iniciais
      populateContent(ui);
      
      return ui;
    } catch (err) {
      console.error("Erro crítico ao criar UI:", err);
      return {
        showError: (msg) => console.error(msg),
        createInteractiveViewer: () => document.createElement('div')
      };
    }
  }
  
  // Função para adicionar estilos CSS
  function addStyles() {
    // Verificar se os estilos já foram adicionados
    if (document.getElementById('waInspectorStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'waInspectorStyles';
    style.textContent = `
      /* Reset e variáveis */
      :root {
        --primary-color: #25D366;
        --secondary-color: #128C7E;
        --light-bg: #f5f5f5;
        --border-color: #ddd;
        --text-color: #333;
        --header-height: 50px;
        --tab-height: 45px;
        --font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      /* Painel principal */
      #waInspectorPanel {
        position: fixed;
        top: 0;
        right: 0;
        width: 520px;
        height: 100vh;
        background: white;
        border-left: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        font-family: var(--font-family);
        z-index: 99999;
        box-shadow: -2px 0 15px rgba(0,0,0,0.1);
        overflow: hidden;
        color: var(--text-color);
      }
      
      /* Header */
      #waHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 15px;
        background: var(--primary-color);
        color: white;
        height: var(--header-height);
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      
      #waHeader h2 {
        font-size: 18px;
        margin: 0;
        font-weight: 600;
      }
      
      #waHeader .wa-version {
        font-size: 12px;
        opacity: 0.8;
        margin-left: 10px;
      }
      
      #waHeaderControls {
        display: flex;
        align-items: center;
      }
      
      #waMinimize, #waClose {
        cursor: pointer;
        margin-left: 12px;
        font-size: 24px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }
      
      #waMinimize:hover, #waClose:hover {
        background: rgba(255,255,255,0.2);
      }
      
      /* Tabs */
      #waInspectorTabs {
        display: flex;
        background: var(--light-bg);
        height: var(--tab-height);
        border-bottom: 1px solid var(--border-color);
      }
      
      #waInspectorTabs button {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        background: var(--light-bg);
        color: var(--text-color);
        cursor: pointer;
        position: relative;
        font-weight: 500;
        flex: 1;
        height: 100%;
        overflow: hidden;
        transition: all 0.2s;
      }
      
      #waInspectorTabs button .tab-icon {
        font-size: 16px;
        margin-bottom: 3px;
      }
      
      #waInspectorTabs button .tab-text {
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        max-width: 100%;
        padding: 0 5px;
      }
      
      #waInspectorTabs button .count {
        position: absolute;
        top: 5px;
        right: 5px;
        background: var(--secondary-color);
        color: white;
        border-radius: 10px;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: bold;
      }
      
      #waInspectorTabs button.active {
        background: white;
        border-bottom: 3px solid var(--primary-color);
      }
      
      #waInspectorTabs button:hover:not(.active) {
        background: rgba(0,0,0,0.05);
      }
      
      /* Content */
      #waInspectorContent {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      #waSearch {
        width: calc(100% - 20px);
        margin: 10px;
        padding: 10px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      #waSearch:focus {
        border-color: var(--primary-color);
      }
      
      /* Content Areas */
      .wa-content {
        flex: 1;
        overflow: auto;
        padding: 0;
        display: none;
      }
      
      .wa-content.active {
        display: block;
      }
      
      /* Lists */
      .wa-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .wa-list li {
        display: flex;
        align-items: center;
        padding: 12px 15px;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: background 0.15s;
      }
      
      .wa-list li span {
        color: var(--text-color);
      }
      
      .wa-list li:hover {
        background: #F0F7FF;
      }
      
      .wa-list li.selected {
        background: #E3F2FD;
      }
      
      /* Detail Pane */
      #waDetailPane {
        flex: 0 0 200px;
        padding: 15px;
        border-top: 1px solid var(--border-color);
        overflow: auto;
        background: var(--light-bg);
        font-size: 14px;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      
      /* Event Detail */
      #waEventDetail {
        display: none;
        margin-top: 10px;
        border-top: 1px solid #eee;
        padding-top: 10px;
      }
      
      #waEventDetail.visible {
        display: block;
      }
      
      /* Estado minimizado */
      #waInspectorPanel.minimized {
        height: var(--header-height);
        overflow: hidden;
      }
      
      #waMinimizeIndicator {
        display: none;
        margin-right: 5px;
      }
      
      #waInspectorPanel.minimized #waMinimizeIndicator {
        display: inline;
      }
      
      /* Estilos para falhas */
      .wa-error {
        color: #D32F2F;
        padding: 15px;
        background: #FFEBEE;
        margin: 10px;
        border-radius: 5px;
        border-left: 4px solid #D32F2F;
      }
      
      /* Status bar */
      #waStatusBar {
        padding: 5px 10px;
        font-size: 12px;
        background: var(--light-bg);
        border-top: 1px solid var(--border-color);
        color: #666;
        display: flex;
        justify-content: space-between;
      }
      
      #waWatermark {
        font-size: 10px;
        color: #888;
        font-style: italic;
        margin-left: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Criar painel base da interface
  function createBasePanel() {
    const panel = document.createElement('div');
    panel.id = 'waInspectorPanel';
    panel.innerHTML = `
      <div id='waHeader'>
        <h2>
          <span id="waMinimizeIndicator">▶</span>
          WAInspector v${WAInspector.config.version}
          <span class='wa-version'>WhatsApp ${WAInspector.utils.sanitizeHTML(WAInspector.data.whatsappVersion)}</span>
        </h2>
        <div id="waHeaderControls">
          <div id='waMinimize'>_</div>
          <div id='waClose'>&times;</div>
        </div>
      </div>
      <div id='waInspectorTabs'>
        <button data-tab='functions' class='active'>
          <span class='tab-icon'>⚙️</span>
          <span class='tab-text'>Funções</span>
          <span class='count'></span>
        </button>
        <button data-tab='important'>
          <span class='tab-icon'>⭐</span>
          <span class='tab-text'>Importantes</span>
          <span class='count'></span>
        </button>
        <button data-tab='all'>
          <span class='tab-icon'>📦</span>
          <span class='tab-text'>Todos</span>
          <span class='count'></span>
        </button>
        <button data-tab='namespace'>
          <span class='tab-icon'>🔍</span>
          <span class='tab-text'>Namespace</span>
          <span class='count'></span>
        </button>
        <button data-tab='events'>
          <span class='tab-icon'>📡</span>
          <span class='tab-text'>Eventos</span>
          <span class='count'></span>
        </button>
      </div>
      <div id='waInspectorContent'>
        <input id='waSearch' placeholder='🔍 Pesquisar...' />
        <div id='tab-functions' class='wa-content active'><ul id='listFunctions' class='wa-list'></ul></div>
        <div id='tab-important' class='wa-content'><ul id='listImportant' class='wa-list'></ul></div>
        <div id='tab-all' class='wa-content'>
          <button id='loadMore'>Carregar mais 50 módulos</button>
          <ul id='listAll' class='wa-list'></ul>
        </div>
        <div id='tab-namespace' class='wa-content'><ul id='listNS' class='wa-list'></ul></div>
        <div id='tab-events' class='wa-content'><ul id='listEvents' class='wa-list'></ul></div>
      </div>
      <div id='waDetailPane'>
        <div id='waDetailInfo'><em>Clique em um item para ver detalhes</em></div>
        <div id='waEventDetail'></div>
      </div>
      <div id='waStatusBar'>
        <span>WAInspector v${WAInspector.config.version}</span>
        <span id='waWatermark'>Licenciado para: ${WAInspector.utils.sanitizeHTML(WAInspector.config.licenseeName)}</span>
        <span>WPP ${WAInspector.utils.sanitizeHTML(window.WPP && window.WPP.version ? window.WPP.version : 'não disponível')}</span>
      </div>
    `;
    document.body.appendChild(panel);
    
    // Configurar controles
    const closeBtn = panel.querySelector('#waClose');
    const minimizeBtn = panel.querySelector('#waMinimize');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => panel.remove());
    }
    
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        panel.classList.toggle('minimized');
        minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '_';
      });
    }
    
    return panel;
  }
  
  // Inicializar tabs
  function initializeTabs(ui) {
    try {
      const panel = ui.panel;
      const tabs = panel.querySelectorAll('#waInspectorTabs button');
      const search = panel.querySelector('#waSearch');
      
      // Função para ativar uma tab
      function activateTab(name) {
        try {
          tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
          panel.querySelectorAll('.wa-content').forEach(c => c.classList.remove('active'));
          panel.querySelector(`#tab-${name}`).classList.add('active');
          
          // Filtrar lista atual
          filterList();
        } catch (err) {
          console.warn("Erro ao ativar tab:", err);
        }
      }
      
      // Função para filtrar listas
      function filterList() {
        try {
          if (!search) return;
          
          const q = search.value.toLowerCase();
          const ul = panel.querySelector('.wa-content.active .wa-list');
          if (!ul) return;
          
          ul.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
          });
        } catch (err) {
          console.warn("Erro ao filtrar lista:", err);
        }
      }
      
      // Configurar contadores para cada tab
      const counts = {
        functions: Object.keys(WAInspector.data.functions).length,
        important: Object.keys(WAInspector.data.moduleMap.importantModules).length,
        all: Object.keys(WAInspector.data.allModules).length,
        namespace: Object.keys(WAInspector.data.namespaceModules).length,
        events: WAInspector.data.events.length
      };
      
      // Configurar eventos para as tabs
      tabs.forEach(btn => {
        try {
          const countElement = btn.querySelector('.count');
          if (countElement) {
            countElement.textContent = counts[btn.dataset.tab] || '0';
          }
          
          btn.addEventListener('click', () => activateTab(btn.dataset.tab));
        } catch (err) {
          console.warn(`Erro ao configurar tab ${btn.dataset.tab}:`, err);
        }
      });
      
      // Configurar evento de busca
      if (search) {
        search.addEventListener('input', filterList);
      }
      
      // Adicionar funções ao objeto UI
      ui.activateTab = activateTab;
      ui.filterList = filterList;
    } catch (err) {
      console.error("Erro ao inicializar tabs:", err);
    }
  }
  
  // Função para popular conteúdo das listas
  function populateContent(ui) {
    try {
      // Função auxiliar para povoar listas
      function populate(listId, items, opts = {}) {
        try {
          const ul = ui.panel.querySelector(listId);
          if (!ul) {
            console.warn(`Elemento não encontrado: ${listId}`);
            return;
          }
          
          const { icon = false, onClick } = opts;
          ul.innerHTML = '';
          
          if (!items || items.length === 0) {
            const emptyMsg = WAInspector.utils.createSafeElement('div', 
              { className: 'wa-error' }, 
              'Nenhum item encontrado.'
            );
            ul.parentNode.insertBefore(emptyMsg, ul);
            return;
          }
          
          items.forEach((item, index) => {
            try {
              const li = WAInspector.utils.createSafeElement('li');
              li.dataset.index = index;
              
              if (icon) {
                const ic = WAInspector.utils.createSafeElement(
                  'span', 
                  { style: 'margin-right: 8px' }, 
                  item.exists ? '✅' : '❌'
                );
                li.appendChild(ic);
              }
              
              const txt = WAInspector.utils.createSafeElement(
                'span', 
                {}, 
                item.label || 'Item sem nome'
              );
              li.appendChild(txt);
              
              li.addEventListener('click', () => {
                try {
                  // Remove selection de todos os itens
                  ul.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
                  // Adiciona seleção para o item clicado
                  li.classList.add('selected');
                  // Executa callback
                  onClick(item, index);
                } catch (clickErr) {
                  console.warn("Erro ao clicar em item:", clickErr);
                  ui.showError(`Erro ao processar clique: ${clickErr.message}`);
                }
              });
              
              ul.appendChild(li);
            } catch (itemErr) {
              console.warn(`Erro ao processar item #${index}:`, itemErr);
            }
          });
        } catch (mainErr) {
          console.error(`Erro crítico ao popular lista ${listId}:`, mainErr);
          ui.showError(`Não foi possível popular a lista ${listId}: ${mainErr.message}`);
        }
      }
      
      // Preparar dados para as listas
      const funcItems = Object.entries(WAInspector.data.functions || {}).map(([k, v]) => ({
        label: k, 
        exists: true,
        module: v.module, 
        name: v.name,
        fn: window.WPP && window.WPP[v.module] ? window.WPP[v.module][v.name] : null
      }));
      
      const impItems = Object.values(WAInspector.data.moduleMap.importantModules || {}).map(m => ({
        label: `${m.name} (#${m.id})`, 
        id: m.id
      }));
      
      const allItems = Object.values(WAInspector.data.allModules || {}).map(m => ({
        label: `#${m.id} ${m.name}`, 
        id: m.id
      }));
      
      const nsItems = Object.values(WAInspector.data.namespaceModules || {}).map(n => ({
        label: n.name, 
        name: n.name, 
        members: n.members
      }));
      
      // Variável para controlar a quantidade de módulos exibidos
      let allCount = 50;
      
      // Povoar a lista de funções
      populate('#listFunctions', funcItems, {
        icon: true,
        onClick: (item) => {
          try {
            const detailInfo = ui.panel.querySelector('#waDetailInfo');
            const eventDetail = ui.panel.querySelector('#waEventDetail');
            
            if (!item.fn) {
              detailInfo.innerHTML = `<strong>Função</strong>: ${WAInspector.utils.sanitizeHTML(item.module)}.${WAInspector.utils.sanitizeHTML(item.name)}<br><span class="wa-error">Função não disponível</span>`;
              
              // Log no console mesmo quando a função não está disponível
              console.group(`🔍 WAInspector - Função: ${item.module}.${item.name}`);
              console.log('Status: Não disponível');
              console.log('Módulo:', item.module);
              console.log('Nome da função:', item.name);
              if (item.directAccess) console.log('Tipo: Acesso direto (sem WPP)');
              console.groupEnd();
              
              return;
            }
            
            const params = WAInspector.utils.getParams(item.fn).join(', ');
            detailInfo.innerHTML = `<strong>Função</strong>: ${WAInspector.utils.sanitizeHTML(item.module)}.${WAInspector.utils.sanitizeHTML(item.name)}<br><strong>Parâmetros</strong>: ${WAInspector.utils.sanitizeHTML(params)}`;
            eventDetail.classList.remove('visible');
            
            // Log detalhado no console
            console.group(`🔍 WAInspector - Função: ${item.module}.${item.name}`);
            console.log('Objeto da função:', item.fn);
            console.log('Parâmetros:', params);
            console.log('Source code:', item.fn.toString());
            console.log('Módulo:', item.module);
            console.log('WPP Path:', `window.WPP['${item.module}']['${item.name}']`);
            console.groupEnd();
          } catch (err) {
            console.warn("Erro ao mostrar detalhes da função:", err);
            ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
          }
        }
      });
      
      // Povoar a lista de módulos importantes
      populate('#listImportant', impItems, {
        onClick: (item) => {
          try {
            const detailInfo = ui.panel.querySelector('#waDetailInfo');
            const eventDetail = ui.panel.querySelector('#waEventDetail');
            
            let moduleInfo = null;
            let moduleHtml = `<strong>Módulo importante</strong> #${WAInspector.utils.sanitizeHTML(item.id)}<br>`;
            
            // Iniciar grupo de console
            console.group(`🔍 WAInspector - Módulo Importante: #${item.id} (${item.label})`);
            console.log('ID:', item.id);
            console.log('Label:', item.label);
            
            try {
              moduleInfo = WAInspector.modules.webpack.secureRequire(item.id);
              if (moduleInfo && moduleInfo.__blocked) {
                moduleHtml += `<span class="wa-error">Acesso bloqueado por segurança: ${WAInspector.utils.sanitizeHTML(moduleInfo.reason || 'Módulo considerado inseguro')}</span>`;
                detailInfo.innerHTML = moduleHtml;
                eventDetail.classList.remove('visible');
                
                console.warn('Status: Acesso bloqueado por segurança', moduleInfo.reason);
                console.groupEnd();
                return;
              }
            } catch (err) {
              console.warn(`Erro ao obter informações do módulo #${item.id}:`, err);
              moduleHtml += `<span class="wa-error">Erro ao obter informações: ${WAInspector.utils.sanitizeHTML(err.message)}</span>`;
              
              console.error('Erro ao acessar módulo:', err);
            }
            
            if (moduleInfo) {
              try {
                // Utilizar o visualizador interativo
                detailInfo.innerHTML = moduleHtml;
                const jsonViewer = ui.createInteractiveViewer(moduleInfo);
                detailInfo.appendChild(jsonViewer);
                eventDetail.classList.remove('visible');
                
                // Explorando o módulo em detalhes no console
                console.log('Módulo carregado:', moduleInfo);
                
                // Adicionar dica para acesso via console
                console.log(`Acesso via console: WAInspector.modules.webpack.secureRequire(${item.id})`);
                
              } catch (formatErr) {
                console.warn("Erro ao formatar dados do módulo:", formatErr);
                moduleHtml += `<span class="wa-error">Erro ao formatar dados: ${WAInspector.utils.sanitizeHTML(formatErr.message)}</span>`;
                detailInfo.innerHTML = moduleHtml;
                
                console.error('Erro ao formatar módulo para exibição:', formatErr);
                // Ainda tenta exibir o módulo cru
                console.log('Módulo (raw):', moduleInfo);
              }
            } else {
              moduleHtml += `<span class="wa-error">Módulo não encontrado ou não carregado</span>`;
              detailInfo.innerHTML = moduleHtml;
              console.warn('Status: Módulo não encontrado ou não carregado');
            }
            
            // Finalize o grupo
            console.groupEnd();
          } catch (err) {
            console.warn("Erro ao mostrar detalhes do módulo importante:", err);
            ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
          }
        }
      });
      
      // Povoar a lista de todos os módulos (limitada)
      populate('#listAll', allItems.slice(0, allCount), {
        onClick: (item) => {
          try {
            const detailInfo = ui.panel.querySelector('#waDetailInfo');
            const eventDetail = ui.panel.querySelector('#waEventDetail');
            
            let moduleInfo = null;
            let moduleHtml = `<strong>Módulo</strong> #${WAInspector.utils.sanitizeHTML(item.id)}<br>`;
            
            try {
              moduleInfo = WAInspector.modules.webpack.secureRequire(item.id);
              if (moduleInfo && moduleInfo.__blocked) {
                moduleHtml += `<span class="wa-error">Acesso bloqueado por segurança: ${WAInspector.utils.sanitizeHTML(moduleInfo.reason || 'Módulo considerado inseguro')}</span>`;
                detailInfo.innerHTML = moduleHtml;
                eventDetail.classList.remove('visible');
                return;
              }
            } catch (err) {
              moduleHtml += `<span class="wa-error">Erro ao obter informações: ${WAInspector.utils.sanitizeHTML(err.message)}</span>`;
            }
            
            if (moduleInfo) {
              try {
                // Utilizar o visualizador interativo
                detailInfo.innerHTML = moduleHtml;
                const jsonViewer = ui.createInteractiveViewer(moduleInfo);
                detailInfo.appendChild(jsonViewer);
                eventDetail.classList.remove('visible');
              } catch (formatErr) {
                moduleHtml += `<span class="wa-error">Erro ao formatar dados: ${WAInspector.utils.sanitizeHTML(formatErr.message)}</span>`;
                detailInfo.innerHTML = moduleHtml;
              }
            } else {
              moduleHtml += `<span class="wa-error">Módulo não encontrado ou não carregado</span>`;
              detailInfo.innerHTML = moduleHtml;
            }
          } catch (err) {
            console.warn("Erro ao mostrar detalhes do módulo:", err);
            ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
          }
        }
      });
      
      // Configurar o botão "Carregar mais"
      const loadMoreBtn = ui.panel.querySelector('#loadMore');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          try {
            allCount += 50;
            loadMoreBtn.textContent = `Carregar mais 50 módulos (${allCount}/${allItems.length})`;
            
            if (allCount >= allItems.length) {
              loadMoreBtn.disabled = true;
              loadMoreBtn.textContent = 'Todos os módulos carregados';
            }
            
            populate('#listAll', allItems.slice(0, allCount), {
              onClick: (item) => {
                try {
                  const detailInfo = ui.panel.querySelector('#waDetailInfo');
                  const eventDetail = ui.panel.querySelector('#waEventDetail');
                  
                  let moduleInfo = null;
                  let moduleHtml = `<strong>Módulo</strong> #${WAInspector.utils.sanitizeHTML(item.id)}<br>`;
                  
                  try {
                    moduleInfo = WAInspector.modules.webpack.secureRequire(item.id);
                    if (moduleInfo && moduleInfo.__blocked) {
                      moduleHtml += `<span class="wa-error">Acesso bloqueado por segurança: ${WAInspector.utils.sanitizeHTML(moduleInfo.reason || 'Módulo considerado inseguro')}</span>`;
                      detailInfo.innerHTML = moduleHtml;
                      eventDetail.classList.remove('visible');
                      return;
                    }
                  } catch (err) {
                    moduleHtml += `<span class="wa-error">Erro ao obter informações: ${WAInspector.utils.sanitizeHTML(err.message)}</span>`;
                  }
                  
                  if (moduleInfo) {
                    try {
                      // Utilizar o visualizador interativo
                      detailInfo.innerHTML = moduleHtml;
                      const jsonViewer = ui.createInteractiveViewer(moduleInfo);
                      detailInfo.appendChild(jsonViewer);
                      eventDetail.classList.remove('visible');
                    } catch (formatErr) {
                      moduleHtml += `<span class="wa-error">Erro ao formatar dados: ${WAInspector.utils.sanitizeHTML(formatErr.message)}</span>`;
                      detailInfo.innerHTML = moduleHtml;
                    }
                  } else {
                    moduleHtml += `<span class="wa-error">Módulo não encontrado ou não carregado</span>`;
                    detailInfo.innerHTML = moduleHtml;
                  }
                } catch (err) {
                  ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
                }
              }
            });
          } catch (err) {
            console.warn("Erro ao carregar mais módulos:", err);
            ui.showError(`Erro ao carregar mais módulos: ${err.message}`);
          }
        });
      }
      
      // Povoar a lista de namespaces
      populate('#listNS', nsItems, {
        onClick: (item) => {
          try {
            const detailInfo = ui.panel.querySelector('#waDetailInfo');
            const eventDetail = ui.panel.querySelector('#waEventDetail');
            
            let nsInfo = null;
            let namespaceData = "";
            
            // Iniciar grupo de console
            console.group(`🔍 WAInspector - Namespace: ${item.name}`);
            console.log('Nome:', item.name);
            console.log('Membros detectados:', item.members);
            
            try {
              // Tenta obter informações do namespace via WPP se disponível
              if (window.WPP && window.WPP.whatsapp) {
                nsInfo = window.WPP.whatsapp[item.name];
              }
              
              // Tenta exibir os membros do namespace se foram capturados durante o mapeamento
              if (item.members && item.members.length) {
                namespaceData = `<br><strong>Membros detectados</strong>: ${WAInspector.utils.sanitizeHTML(item.members.join(', '))}`;
              }
            } catch (err) {
              console.warn(`Erro ao obter informações do namespace ${item.name}:`, err);
              namespaceData = `<br><span class="wa-error">Erro ao acessar: ${WAInspector.utils.sanitizeHTML(err.message)}</span>`;
              console.error('Erro ao acessar namespace:', err);
            }
            
            // Cria a exibição com informações formatadas e tratamento de erros
            let nsHtml = `<strong>Namespace</strong> ${WAInspector.utils.sanitizeHTML(item.name)}${namespaceData}`;
            
            if (nsInfo) {
              try {
                detailInfo.innerHTML = nsHtml;
                const jsonViewer = ui.createInteractiveViewer(nsInfo);
                detailInfo.appendChild(jsonViewer);
                eventDetail.classList.remove('visible');
              } catch (formatErr) {
                console.warn("Erro ao formatar dados do namespace:", formatErr);
                nsHtml += `<br><span class="wa-error">Erro ao formatar dados: ${WAInspector.utils.sanitizeHTML(formatErr.message)}</span>`;
                detailInfo.innerHTML = nsHtml;
              }
            } else {
              const sourceInfo = item.directAccess ? 
                "<br><em>(Acesso direto via webpack)</em>" : 
                "<br><em>(WPP não disponível para acessar este namespace)</em>";
                
              nsHtml += sourceInfo;
              detailInfo.innerHTML = nsHtml;
              console.log(item.directAccess ? 
                'Tipo: Acesso direto via webpack' : 
                'Status: WPP não disponível para acessar este namespace');
            }
            
            // Finalizar grupo
            console.groupEnd();
          } catch (err) {
            console.warn("Erro ao mostrar detalhes do namespace:", err);
            ui.showError(`Erro ao mostrar detalhes: ${err.message}`);
          }
        }
      });
    } catch (err) {
      console.error("Erro crítico ao popular conteúdo:", err);
      ui.showError(`Erro ao popular conteúdo: ${err.message}`);
    }
  }
  
  // Visualizador interativo de objetos
  function createInteractiveViewer(obj, maxDepth = 3, expandedPaths = new Set()) {
    const container = document.createElement('div');
    container.className = 'wa-inspector-object-viewer';
    
    // Adicionar estilos
    const style = document.createElement('style');
    style.textContent = `
      .wa-inspector-object-viewer {
        font-family: monospace;
        font-size: 12px;
        line-height: 1.4;
        margin: 5px 0;
        white-space: nowrap;
        overflow: auto;
        max-height: 500px;
      }
      .wa-inspector-object-viewer .property {
        margin-left: 20px;
      }
      .wa-inspector-object-viewer .toggle {
        cursor: pointer;
        color: #6e6e6e;
        display: inline-block;
        width: 12px;
        text-align: center;
        margin-right: 3px;
      }
      .wa-inspector-object-viewer .toggle:hover {
        color: #000;
      }
      .wa-inspector-object-viewer .key {
        color: #881391;
      }
      .wa-inspector-object-viewer .string {
        color: #1a1aa6;
      }
      .wa-inspector-object-viewer .number {
        color: #1c00cf;
      }
      .wa-inspector-object-viewer .boolean {
        color: #1c00cf;
      }
      .wa-inspector-object-viewer .null {
        color: #1c00cf;
      }
      .wa-inspector-object-viewer .undefined {
        color: #1c00cf;
      }
      .wa-inspector-object-viewer .function {
        color: #067d17;
      }
      .wa-inspector-object-viewer .object-summary {
        color: #444;
        font-style: italic;
      }
      .wa-inspector-object-viewer .error {
        color: #f00;
      }
    `;
    container.appendChild(style);
    
    // Função recursiva para renderizar objeto
    function renderObject(obj, path = '', depth = 0) {
      const wrapper = document.createElement('div');
      
      if (depth > maxDepth) {
        const summary = document.createElement('span');
        summary.className = 'object-summary';
        summary.textContent = '[Objeto aninhado]';
        summary.style.cursor = 'pointer';
        summary.onclick = () => {
          const newExpandedPaths = new Set(expandedPaths);
          newExpandedPaths.add(path);
          const newViewer = createInteractiveViewer(obj, maxDepth + 3, newExpandedPaths);
          container.parentNode.replaceChild(newViewer, container);
        };
        wrapper.appendChild(summary);
        return wrapper;
      }
      
      if (obj === null) {
        const value = document.createElement('span');
        value.className = 'null';
        value.textContent = 'null';
        wrapper.appendChild(value);
        return wrapper;
      }
      
      if (obj === undefined) {
        const value = document.createElement('span');
        value.className = 'undefined';
        value.textContent = 'undefined';
        wrapper.appendChild(value);
        return wrapper;
      }
      
      if (typeof obj !== 'object' && typeof obj !== 'function') {
        const value = document.createElement('span');
        value.className = typeof obj;
        
        if (typeof obj === 'string') {
          // Truncar strings longas
          if (obj.length > 100) {
            value.textContent = `"${WAInspector.utils.sanitizeHTML(obj.substring(0, 100) + '...')}"`;
            value.title = WAInspector.utils.sanitizeHTML(obj);
          } else {
            value.textContent = `"${WAInspector.utils.sanitizeHTML(obj)}"`;
          }
        } else {
          value.textContent = String(obj);
        }
        
        wrapper.appendChild(value);
        return wrapper;
      }
      
      if (typeof obj === 'function') {
        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        toggle.textContent = expandedPaths.has(path) ? '▼' : '▶';
        
        const value = document.createElement('span');
        value.className = 'function';
        
        try {
          // Extrair nome e parâmetros da função
          const funcStr = obj.toString();
          const funcMatch = funcStr.match(/(?:function\s*)?([^\s(]*)\s*\(([^)]*)\)/);
          const funcName = funcMatch && funcMatch[1] ? funcMatch[1] : '<anônima>';
          const params = funcMatch && funcMatch[2] ? funcMatch[2] : '';
          
          value.textContent = `ƒ ${WAInspector.utils.sanitizeHTML(funcName)}(${WAInspector.utils.sanitizeHTML(params)})`;
          
          // Mostrar código da função ao clicar
          toggle.onclick = () => {
            const newExpandedPaths = new Set(expandedPaths);
            if (expandedPaths.has(path)) {
              newExpandedPaths.delete(path);
            } else {
              newExpandedPaths.add(path);
            }
            
            const newViewer = createInteractiveViewer(obj, maxDepth, newExpandedPaths);
            container.parentNode.replaceChild(newViewer, container);
          };
          
          wrapper.appendChild(toggle);
          wrapper.appendChild(value);
          
          // Mostrar código da função se expandido
          if (expandedPaths.has(path)) {
            const code = document.createElement('div');
            code.className = 'property';
            code.textContent = funcStr;
            wrapper.appendChild(code);
          }
        } catch (e) {
          const error = document.createElement('span');
          error.className = 'error';
          error.textContent = `[Erro ao processar função: ${WAInspector.utils.sanitizeHTML(e.message)}]`;
          wrapper.appendChild(error);
        }
        
        return wrapper;
      }
      
      try {
        // É um objeto ou array
        const isArray = Array.isArray(obj);
        const isEmpty = isArray ? obj.length === 0 : Object.keys(obj).length === 0;
        
        // Criar toggle e sumário
        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        
        if (isEmpty) {
          toggle.textContent = ' ';
          const summary = document.createElement('span');
          summary.textContent = isArray ? '[]' : '{}';
          wrapper.appendChild(toggle);
          wrapper.appendChild(summary);
          return wrapper;
        }
        
        toggle.textContent = expandedPaths.has(path) ? '▼' : '▶';
        toggle.onclick = () => {
          const newExpandedPaths = new Set(expandedPaths);
          if (expandedPaths.has(path)) {
            newExpandedPaths.delete(path);
          } else {
            newExpandedPaths.add(path);
          }
          
          const newViewer = createInteractiveViewer(obj, maxDepth, newExpandedPaths);
          container.parentNode.replaceChild(newViewer, container);
        };
        
        const summary = document.createElement('span');
        if (isArray) {
          summary.textContent = `Array(${obj.length})`;
        } else if (obj.constructor && obj.constructor.name !== 'Object') {
          summary.textContent = `${WAInspector.utils.sanitizeHTML(obj.constructor.name)} {}`;
        } else {
          summary.textContent = '{}';
        }
        
        wrapper.appendChild(toggle);
        wrapper.appendChild(summary);
        
        // Mostrar propriedades se expandido
        if (expandedPaths.has(path)) {
          let props;
          if (isArray) {
            props = [...obj.keys()];
          } else {
            // Obter propriedades, incluindo não enumeráveis
            props = [];
            let curr = obj;
            const processed = new Set();
            
            while (curr && !processed.has(curr)) {
              processed.add(curr);
              props.push(...Object.getOwnPropertyNames(curr));
              curr = Object.getPrototypeOf(curr);
              
              // Parar após o protótipo Object
              if (curr === Object.prototype) {
                props.push(...Object.getOwnPropertyNames(curr));
                break;
              }
            }
            
            // Filtrar duplicatas e propriedades do sistema
            props = [...new Set(props)].filter(p => 
              !p.startsWith('__') && p !== 'constructor' && p !== 'prototype');
          }
          
          // Ordenar propriedades
          props.sort((a, b) => {
            // Propriedades numéricas primeiro (para arrays)
            const aIsNum = !isNaN(a);
            const bIsNum = !isNaN(b);
            if (aIsNum && !bIsNum) return -1;
            if (!aIsNum && bIsNum) return 1;
            return String(a).localeCompare(String(b));
          });
          
          // Renderizar propriedades
          for (const prop of props) {
            try {
              const propDiv = document.createElement('div');
              propDiv.className = 'property';
              
              const keySpan = document.createElement('span');
              keySpan.className = 'key';
              keySpan.textContent = isArray && !isNaN(prop) ? `[${prop}]` : WAInspector.utils.sanitizeHTML(prop);
              
              propDiv.appendChild(keySpan);
              propDiv.appendChild(document.createTextNode(': '));
              
              let value;
              try {
                value = obj[prop];
              } catch (err) {
                // Propriedade inacessível
                const error = document.createElement('span');
                error.className = 'error';
                error.textContent = `[Acesso negado: ${WAInspector.utils.sanitizeHTML(err.message)}]`;
                propDiv.appendChild(error);
                wrapper.appendChild(propDiv);
                continue;
              }
              
              const newPath = path ? `${path}.${prop}` : prop;
              propDiv.appendChild(renderObject(value, newPath, depth + 1));
              wrapper.appendChild(propDiv);
            } catch (err) {
              console.warn(`Erro ao renderizar propriedade ${prop}:`, err);
            }
          }
        }
      } catch (err) {
        const error = document.createElement('span');
        error.className = 'error';
        error.textContent = `[Erro ao processar objeto: ${WAInspector.utils.sanitizeHTML(err.message)}]`;
        wrapper.appendChild(error);
      }
      
      return wrapper;
    }
    
    container.appendChild(renderObject(obj));
    return container;
  }

  // Inicialização principal
  async function init() {
    try {
      // Inicializar acesso ao webpack
      await WAInspector.modules.webpack.init();
      
      // Descobrir funções e mapear estrutura
      await WAInspector.modules.discovery.init();
      
      // Processar stores do WhatsApp
      WAInspector.modules.stores = await processWhatsAppStores();
      
      // Inicializar interface do usuário
      WAInspector.modules.ui = createUI(WAInspector.modules.stores);
      
      // Inicializar captura de eventos (após UI)
      WAInspector.modules.events.init(WAInspector.modules.ui);
      
      console.log("WAInspector inicializado com sucesso!");
      
      // Disponibiliza como variável global
      window.WAInspector = WAInspector;
    } catch (err) {
      console.error("Erro durante inicialização do WAInspector:", err);
    }
  }
  
  // Iniciar o WAInspector
  await init();
})(); 