// PDFiller 2 - Main Application Entrypoint
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Inicializando PDFiller 2...');

    // CONFIGURACIÓN E INSTANCIA DE MÓDULOS GLOBALES
    window.pdfInstance = null;
    window.pdfBytes = null;
    window.pdfScale = 1.0;
    window.pdfPageNum = 1;
    window.currentTool = 'edit'; // edit, stamp-text, stamp-icon, corrector, none

    // --- GESTOR DE HISTORIAL CENTRALIZADO (UNDO / REDO / DELETE) ---
    window.historyManager = (() => {
        const undoStack = [];
        const redoStack = [];
        
        const saveState = () => {
            if (window.syncDomTextToFields) window.syncDomTextToFields();

            const snapshot = {
                fields: JSON.parse(JSON.stringify(window.pdfFields || [])),
                correctors: window.fillToolsModule ? JSON.parse(JSON.stringify(window.fillToolsModule.getCorrectorPatches())) : [],
                checkboxes: window.fillToolsModule ? JSON.parse(JSON.stringify(window.fillToolsModule.getCheckboxes())) : [],
                signatures: window.signaturesModule ? JSON.parse(JSON.stringify(window.signaturesModule.getPlacedSignatures())) : []
            };
            
            undoStack.push(snapshot);
            redoStack.length = 0; // Limpiar redo ante nueva acción
            
            if (undoStack.length > 50) undoStack.shift();
            updateButtons();
        };
        
        const updateButtons = () => {
            const btnUndo = document.getElementById('btn-undo');
            const btnRedo = document.getElementById('btn-redo');
            if (btnUndo) btnUndo.disabled = undoStack.length <= 1;
            if (btnRedo) btnRedo.disabled = redoStack.length === 0;
        };
        
        const restoreState = (state) => {
            window.pdfFields = JSON.parse(JSON.stringify(state.fields));
            
            if (window.fillToolsModule) {
                window.fillToolsModule.setCorrectorPatches(JSON.parse(JSON.stringify(state.correctors)));
                if (window.fillToolsModule.setCheckboxes) {
                    window.fillToolsModule.setCheckboxes(JSON.parse(JSON.stringify(state.checkboxes || [])));
                }
            }
            
            if (window.signaturesModule) {
                window.signaturesModule.setPlacedSignatures(JSON.parse(JSON.stringify(state.signatures)));
            }
            
            reRenderUI();
            updateButtons();
        };
        
        const undo = () => {
            if (undoStack.length <= 1) return;
            const current = undoStack.pop();
            redoStack.push(current);
            const prev = undoStack[undoStack.length - 1];
            restoreState(prev);
        };
        
        const redo = () => {
            if (redoStack.length === 0) return;
            const next = redoStack.pop();
            undoStack.push(next);
            restoreState(next);
        };
        
        const reRenderUI = () => {
            if (window.editorModule && window.editorModule.initFieldsOverlay) {
                window.editorModule.initFieldsOverlay(window.pdfFields);
            }
            if (window.fillToolsModule && window.fillToolsModule.renderPlacedTools) {
                window.fillToolsModule.renderPlacedTools();
            }
            if (window.signaturesModule && window.signaturesModule.renderPlacedSignatures) {
                window.signaturesModule.renderPlacedSignatures();
            }
        };
        
        const deleteElement = (id) => {
            console.log(`Eliminando elemento con ID: ${id}`);
            let deletedAny = false;

            // Eliminar directamente del DOM si existe para sincronización visual instantánea
            const domEl = document.getElementById(id) || document.getElementById(`wrapper_${id}`) || document.getElementById(`patch_${id}`);
            if (domEl) {
                domEl.remove();
                deletedAny = true;
            }
            
            // 1. Buscar en campos editables (factura original y estampas de texto)
            if (window.pdfFields) {
                const fIdx = window.pdfFields.findIndex(f => f.id === id);
                if (fIdx > -1) {
                    const field = window.pdfFields[fIdx];
                    if (field.isStamp) {
                        window.pdfFields.splice(fIdx, 1);
                    } else {
                        field.deleted = true; // Flag para ignorar renderización y exportación
                    }
                    deletedAny = true;
                }
            }
            

            
            // 3. Buscar en correctores colocados
            if (window.fillToolsModule) {
                const correctors = window.fillToolsModule.getCorrectorPatches();
                const cIdx = correctors.findIndex(c => c.id === id);
                if (cIdx > -1) {
                    correctors.splice(cIdx, 1);
                    deletedAny = true;
                }
            }
            
            // 3b. Buscar en casillas colocadas (Eliminar todas las casillas solapadas o duplicadas en la misma posición)
            if (window.fillToolsModule && window.fillToolsModule.getCheckboxes) {
                const checkboxes = window.fillToolsModule.getCheckboxes();
                const targetCb = checkboxes.find(cb => cb.id === id);
                if (targetCb) {
                    const centerX = targetCb.x + targetCb.width / 2;
                    const centerY = targetCb.y + targetCb.height / 2;
                    const activePageNum = targetCb.pageNum || 1;

                    for (let i = checkboxes.length - 1; i >= 0; i--) {
                        const cb = checkboxes[i];
                        if (Number(cb.pageNum || 1) === Number(activePageNum)) {
                            const cbCenterX = cb.x + cb.width / 2;
                            const cbCenterY = cb.y + cb.height / 2;
                            const dist = Math.sqrt((centerX - cbCenterX) ** 2 + (centerY - cbCenterY) ** 2);
                            if (dist < 14 || cb.id === id) {
                                checkboxes.splice(i, 1);
                                deletedAny = true;
                            }
                        }
                    }
                }
            }
            
            // 4. Buscar en firmas colocadas
            if (window.signaturesModule) {
                const signatures = window.signaturesModule.getPlacedSignatures();
                const sIdx = signatures.findIndex(s => s.id === id);
                if (sIdx > -1) {
                    signatures.splice(sIdx, 1);
                    deletedAny = true;
                }
            }
            
            if (deletedAny) {
                saveState();
                reRenderUI();
            }
        };
        
        return {
            saveState,
            undo,
            redo,
            deleteElement,
            reRenderUI, // Exponer reRenderUI para actualizaciones y redibujado en caliente
            init: () => {
                undoStack.length = 0;
                redoStack.length = 0;
                saveState(); // Guardar estado inicial limpio
            }
        };
    })();

    // Referencias a Elementos DOM
    const tabLinks = document.querySelectorAll('.tab-link');
    const toolbarPanels = document.querySelectorAll('.toolbar-panel');
    const btnSavePdf = document.getElementById('btn-save-pdf');
    const pdfUpload = document.getElementById('pdf-upload');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Binds de Deshacer / Rehacer en Cabecera
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.addEventListener('click', () => window.historyManager.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => window.historyManager.redo());

    // Bind de Descartar en Cabecera
    const btnDiscard = document.getElementById('btn-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
            if (!window.pdfInstance) return;
            const confirmDiscard = confirm("Si descartas el documento actual, perderás todos los cambios no guardados. ¿Deseas continuar?");
            if (confirmDiscard) {
                console.log('Descartando edición y volviendo a estado vacío...');
                
                // Limpiar variables globales
                window.pdfInstance = null;
                window.pdfBytes = null;
                window.pdfFields = [];
                window.pdfPageNum = 1;
                
                if (window.fillToolsModule) {
                    window.fillToolsModule.setCorrectorPatches([]);
                    window.fillToolsModule.setCheckboxes([]);
                }
                if (window.signaturesModule) {
                    window.signaturesModule.setPlacedSignatures([]);
                }
                
                // Limpiar DOM
                const overlay = document.getElementById('pdf-overlay');
                if (overlay) overlay.innerHTML = '';
                
                const pagesContainer = document.getElementById('pages-container');
                if (pagesContainer) pagesContainer.innerHTML = '';
                
                // Resetear controles de zoom
                window.pdfScale = 1.0;
                const zoomSlider = document.getElementById('zoom-slider');
                if (zoomSlider) zoomSlider.value = 100;
                const zoomPercentage = document.getElementById('zoom-percentage');
                if (zoomPercentage) zoomPercentage.textContent = '100%';
                
                // Ocultar viewport y mostrar estado vacío
                const pdfViewport = document.getElementById('pdf-viewport');
                const emptyState = document.getElementById('empty-state');
                if (pdfViewport) pdfViewport.style.display = 'none';
                if (emptyState) emptyState.style.display = 'flex';
                
                // Activar clase no-document-loaded en el body
                document.body.classList.add('no-document-loaded');
                
                // Deshabilitar botones de guardar
                if (btnSaveDraft) btnSaveDraft.disabled = true;
                if (btnSavePdf) btnSavePdf.disabled = true;
                
                // Ocultar botón de descartar
                btnDiscard.style.display = 'none';
                
                // Deshabilitar undo/redo
                if (btnUndo) btnUndo.disabled = true;
                if (btnRedo) btnRedo.disabled = true;
                
                // Limpiar input file
                if (pdfUpload) pdfUpload.value = '';
                
                console.log('¡Edición descartada correctamente!');
            }
        });
    }

    // Shortcuts de Teclado (Ctrl+Z y Ctrl+Y) + Movimiento de Flechas (Desktop Nudging) + Copy-Paste (Ctrl+C / Ctrl+V)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            window.historyManager.undo();
            return;
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            window.historyManager.redo();
            return;
        }

        // CTRL+C: Copiar campo de texto seleccionado (campo original o estampa libre)
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
            const activeWrapper = document.querySelector('.editable-field-wrapper.active-focus');
            if (activeWrapper) {
                const id = activeWrapper.id.replace('wrapper_', '');
                if (window.pdfFields) {
                    const field = window.pdfFields.find(f => f.id === id);
                    if (field) {
                        const input = activeWrapper.querySelector('.editable-field-input');
                        const style = window.getComputedStyle(input);
                        window.fieldClipboard = {
                            text: field.text,
                            fontSize: field.fontSize,
                            fontName: field.fontName,
                            color: style.color || field.color,
                            width: field.width,
                            height: field.height,
                            sectionKey: field.sectionKey
                        };
                        console.log('Campo copiado al portapapeles:', window.fieldClipboard);
                        e.preventDefault();
                    }
                }
            }
            return;
        }

        // CTRL+V: Pegar campo copiado como una nueva estampa editable
        if (e.ctrlKey && e.key.toLowerCase() === 'v') {
            if (window.fieldClipboard) {
                const stampId = `text_stamp_${Date.now()}`;
                let posX = 100;
                let posY = 100;

                const lastFocused = document.querySelector('.editable-field-wrapper.active-focus, .draggable-stamp.active-focus, .corrector-patch.active-focus');
                if (lastFocused) {
                    posX = (parseFloat(lastFocused.style.left) || 0) + 24;
                    posY = (parseFloat(lastFocused.style.top) || 0) + 24;
                } else {
                    const scroller = document.getElementById('pdf-scroller');
                    const scrollerRect = scroller.getBoundingClientRect();
                    const viewRect = document.getElementById('pdf-overlay').getBoundingClientRect();
                    const zoom = window.viewportZoom || 1.0;
                    posX = Math.max(20, ((scrollerRect.left + scroller.clientWidth / 2 - 50) - viewRect.left) / zoom);
                    posY = Math.max(20, ((scrollerRect.top + scroller.clientHeight / 2 - 12) - viewRect.top) / zoom);
                }

                const newField = {
                    id: stampId,
                    text: window.fieldClipboard.text,
                    x: posX,
                    y: posY,
                    width: window.fieldClipboard.width,
                    height: window.fieldClipboard.height,
                    fontSize: window.fieldClipboard.fontSize,
                    fontName: window.fieldClipboard.fontName,
                    originalFontSize: window.fieldClipboard.fontSize / window.pdfScale,
                    color: window.fieldClipboard.color,
                    sectionKey: window.fieldClipboard.sectionKey || 'datos',
                    isStamp: true
                };

                if (window.pdfFields) {
                    window.pdfFields.push(newField);
                    window.historyManager.saveState();
                    window.historyManager.reRenderUI();

                    // Foco inmediato al campo recién pegado
                    setTimeout(() => {
                        const input = document.getElementById(stampId);
                        if (input) {
                            input.style.pointerEvents = 'auto';
                            input.contentEditable = true;
                            input.focus();
                            const range = document.createRange();
                            range.selectNodeContents(input);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }, 120);
                }
                e.preventDefault();
            }
            return;
        }

        // Buscar si hay algún elemento con foco activo en el overlay
        const activeWrapper = document.querySelector('.editable-field-wrapper.active-focus, .draggable-stamp.active-focus, .corrector-patch.active-focus, .draggable-checkbox-wrapper.active-focus');
        if (!activeWrapper) return;

        // Si el usuario está escribiendo activamente dentro de un texto, no intervenir en sus teclas de dirección
        if (document.activeElement && document.activeElement.contentEditable === 'true') {
            return;
        }

        const step = e.shiftKey ? 10 : 2; // Shift para pasos de 10px, flecha sola para pasos de 2px
        let dx = 0;
        let dy = 0;

        if (e.key === 'ArrowUp') { dy = -step; e.preventDefault(); }
        else if (e.key === 'ArrowDown') { dy = step; e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { dx = -step; e.preventDefault(); }
        else if (e.key === 'ArrowRight') { dx = step; e.preventDefault(); }

        if (dx !== 0 || dy !== 0) {
            const id = activeWrapper.id.replace('wrapper_', '');
            let updated = false;

            // 1. Mover campos editables
            if (window.pdfFields) {
                const field = window.pdfFields.find(f => f.id === id);
                if (field) {
                    field.x += dx;
                    field.y += dy;
                    activeWrapper.style.left = `${field.x}px`;
                    activeWrapper.style.top = `${field.y}px`;
                    updated = true;
                }
            }



            // 3. Mover correctores colocados
            if (window.fillToolsModule) {
                const correctors = window.fillToolsModule.getCorrectorPatches();
                const corrector = correctors.find(c => c.id === id);
                if (corrector) {
                    corrector.x += dx;
                    corrector.y += dy;
                    activeWrapper.style.left = `${corrector.x}px`;
                    activeWrapper.style.top = `${corrector.y}px`;
                    updated = true;
                }
            }

            // 4. Mover firmas colocadas
            if (window.signaturesModule) {
                const signatures = window.signaturesModule.getPlacedSignatures();
                const sig = signatures.find(s => s.id === id);
                if (sig) {
                    sig.x += dx;
                    sig.y += dy;
                    activeWrapper.style.left = `${sig.x}px`;
                    activeWrapper.style.top = `${sig.y}px`;
                    updated = true;
                }
            }

            // 5. Mover casillas colocadas
            if (window.fillToolsModule && window.fillToolsModule.getCheckboxes) {
                const checkboxes = window.fillToolsModule.getCheckboxes();
                const cb = checkboxes.find(c => c.id === id);
                if (cb) {
                    cb.x += dx;
                    cb.y += dy;
                    activeWrapper.style.left = `${cb.x}px`;
                    activeWrapper.style.top = `${cb.y}px`;
                    updated = true;
                }
            }

            if (updated) {
                if (window.editorModule && window.editorModule.runCollisionDetection) {
                    window.editorModule.runCollisionDetection();
                }
                if (window.historyManager) {
                    window.historyManager.saveState();
                }
            }
        }
    });

    // --- 1. GESTIÓN DE PESTAÑAS (TAB SYSTEM) ---
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            // Actualizar botones de pestaña
            tabLinks.forEach(btn => btn.classList.remove('active'));
            link.classList.add('active');

            // Actualizar paneles de herramientas
            toolbarPanels.forEach(panel => panel.classList.remove('active'));
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) targetPanel.classList.add('active');

            // Cambiar herramienta actual según pestaña activa
            deactivateAllTools();
            
            // Sincronizar clases de body y variables de estado del modo
            document.body.classList.remove('edit-mode-active', 'fill-mode-active', 'signature-mode-active');
            
            if (targetId === 'panel-editar') {
                window.currentTool = 'edit';
                document.body.classList.add('edit-mode-active');
            } else if (targetId === 'panel-rellenar') {
                window.currentTool = 'none'; // Se activa al pulsar una subherramienta
                document.body.classList.add('fill-mode-active');
            } else if (targetId === 'panel-firmas') {
                window.currentTool = 'signature';
                document.body.classList.add('signature-mode-active');
            }
        });
    });

    // Desactivar herramientas activas
    function deactivateAllTools() {
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => btn.classList.remove('active'));
        document.getElementById('workspace-container').style.cursor = 'default';
        if (window.disableCorrectorDraw) window.disableCorrectorDraw();
    }

    // --- 2. CARGA DE PDF ---
    // No cargar ningún PDF por defecto. Se inicia en estado vacío para que el usuario suba su propio archivo.
    if (loadingOverlay) loadingOverlay.classList.remove('active');

    // Carga de archivo manual por el usuario
    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            if (isPdf) {
                loadingOverlay.classList.add('active');
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const bytes = new Uint8Array(event.target.result);
                    await loadPdfDocument(bytes, file.name);
                };
                reader.readAsArrayBuffer(file);
            } else {
                alert('El archivo seleccionado no parece ser un documento PDF válido.');
            }
        }
    });

    // Carga física del PDF en la UI (soporta URL o bytes)
    async function loadPdfDocument(source, filename = null) {
        try {
            console.log('Cargando documento en PDF.js...');
            
            // Truco del Blob URL para instanciar el Worker localmente de forma segura,
            // evitando bloqueos CORS del navegador a CDNs externos.
            const workerCode = `importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js');`;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
            
            let loadingTask;
            if (typeof source === 'string') {
                console.log(`Descargando bytes binarios desde URL: ${source}`);
                const response = await fetch(source);
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                window.pdfBytes = new Uint8Array(buffer);
                // Clonar la matriz antes de pasarla a PDF.js para evitar que consuma/separe el ArrayBuffer original (Detached Buffer)
                loadingTask = pdfjsLib.getDocument({ data: window.pdfBytes.slice(0) });
                window.pdfFileName = filename || source.split('/').pop() || 'documento.pdf';
            } else if (source instanceof Uint8Array) {
                window.pdfBytes = source;
                // Clonar la matriz antes de pasarla a PDF.js
                loadingTask = pdfjsLib.getDocument({ data: source.slice(0) });
                window.pdfFileName = filename || 'documento_subido.pdf';
            } else {
                throw new Error('Origen de PDF no compatible.');
            }
            
            window.pdfInstance = await loadingTask.promise;
            
            // Resetear paginación y arrays en nueva carga
            window.pdfPageNum = 1;
            window.pdfFields = [];
            if (window.fillToolsModule) {
                window.fillToolsModule.setCorrectorPatches([]);
                window.fillToolsModule.setCheckboxes([]);
            }
            if (window.signaturesModule) {
                window.signaturesModule.setPlacedSignatures([]);
            }

            // Inicializar controles de paginación flotantes
            initPaginationControls(window.pdfInstance.numPages);
            
            // Generar barra lateral de miniaturas
            await initSidebarThumbnails(window.pdfInstance);
            
            // Renderizar primera página
            await window.renderPdfPage(window.pdfPageNum);
            
            // Inicializar gestor de historial de cambios
            if (window.historyManager) {
                window.historyManager.init();
            }

            // Inicializar gestor de zoom/paneo táctil
            if (window.initializeGestures) {
                window.initializeGestures();
            }

            // ESCANEAR CASILLAS PARA CONFIGURAR LA DISPONIBILIDAD DEL BOTÓN CASILLA EN LA UI
            setTimeout(async () => {
                const btnCasilla = document.getElementById('tool-casilla');
                if (btnCasilla && window.fillToolsModule && window.fillToolsModule.checkDocumentForCheckboxes) {
                    const hasCheckboxes = await window.fillToolsModule.checkDocumentForCheckboxes();
                    if (hasCheckboxes) {
                        btnCasilla.disabled = false;
                        btnCasilla.style.opacity = '1';
                        btnCasilla.style.pointerEvents = 'auto';
                        btnCasilla.title = 'Casilla: Rellenar casillas del formulario con un clic (Tick, Cruz, Círculo). ¡Casillas detectadas!';
                        
                        // Añadir un badge visual verde sutil
                        let badge = btnCasilla.querySelector('.casilla-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'casilla-badge';
                            badge.innerHTML = '<i class="fa-solid fa-circle" style="color: #10b981; font-size: 6px; position: absolute; top: 4px; right: 4px;"></i>';
                            btnCasilla.style.position = 'relative';
                            btnCasilla.appendChild(badge);
                        }
                    } else {
                        btnCasilla.disabled = true;
                        btnCasilla.style.opacity = '0.35';
                        btnCasilla.style.pointerEvents = 'none'; // Desactivar clics por completo
                        btnCasilla.title = 'Deshabilitado: No se han detectado casillas impresas ni digitales en este PDF.';
                        
                        const badge = btnCasilla.querySelector('.casilla-badge');
                        if (badge) badge.remove();
                    }
                }
            }, 500);

            // Intentar restaurar borrador si existe y es la factura por defecto
            if (source === 'assets/sample_invoice.pdf') {
                setTimeout(async () => {
                    await restoreDraftSession();
                }, 600);
            }

            // Ocultar estado vacío y mostrar viewport de PDF
            const emptyState = document.getElementById('empty-state');
            const pdfViewport = document.getElementById('pdf-viewport');
            if (emptyState) emptyState.style.display = 'none';
            if (pdfViewport) pdfViewport.style.display = 'inline-block';
            
            // Remover clase no-document-loaded en el body
            document.body.classList.remove('no-document-loaded');

            // Mostrar botón de descartar y habilitar botones de guardar
            const btnDiscard = document.getElementById('btn-discard');
            if (btnDiscard) btnDiscard.style.display = 'inline-flex';
            if (btnSaveDraft) btnSaveDraft.disabled = false;
            if (btnSavePdf) btnSavePdf.disabled = false;

            loadingOverlay.classList.remove('active');
            console.log('¡Documento cargado con éxito!');
            console.log('--- DIAGNÓSTICO PDFILLER 2 ---');
            console.log('Escala PDF activa:', window.pdfScale);
            console.log('Campos totales en modelo:', window.pdfFields ? window.pdfFields.length : 0);
            console.log('Elementos inyectados en DOM (overlay):', document.querySelectorAll('.editable-field-wrapper').length);
            console.log('Clase de body activa:', document.body.className);
        } catch (err) {
            console.error('Error crítico al parsear el PDF:', err);
            alert('Error al abrir el PDF. Por favor verifique el archivo.\nDetalle: ' + err.message);
            loadingOverlay.classList.remove('active');
        }
    }

    // --- SINCRO DOM EDITS CON EL MODELO ---
    window.syncDomTextToFields = () => {
        if (window.pdfFields) {
            window.pdfFields.forEach(field => {
                if (field.pageNum === window.pdfPageNum && !field.deleted && !field.isStamp) {
                    const el = document.getElementById(field.id);
                    if (el) {
                        field.text = el.textContent;
                    }
                }
            });
        }
    };

    // --- NAVEGACIÓN Y CAMBIO DE PÁGINAS ---
    window.changePdfPage = async (pageNum) => {
        if (!window.pdfInstance || pageNum < 1 || pageNum > window.pdfInstance.numPages) return;
        
        console.log(`Cambiando a página ${pageNum}...`);
        
        // Mostrar spinner
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.querySelector('p').textContent = `Cargando página ${pageNum}...`;
            loadingOverlay.classList.add('active');
        }
        
        // 1. Sincronizar texto actual en el DOM antes de salir de la página
        if (window.syncDomTextToFields) window.syncDomTextToFields();
        
        // 2. Cambiar número de página activo
        window.pdfPageNum = pageNum;
        
        // 3. Renderizar nueva página (PDF.js)
        await window.renderPdfPage(pageNum);
        
        // 4. Redibujar overlays
        if (window.historyManager && window.historyManager.reRenderUI) {
            window.historyManager.reRenderUI();
        }
        
        // Refresh casilla potential placeholders if active
        if (window.fillToolsModule && window.fillToolsModule.showPotentialCheckboxes) {
            window.fillToolsModule.showPotentialCheckboxes();
        }
        
        // 5. Sincronizar controles de paginación (Select y total)
        const selectPage = document.getElementById('select-page-num');
        if (selectPage) selectPage.value = pageNum;
        
        // 6. Actualizar barra lateral de miniaturas activa
        document.querySelectorAll('.sidebar-page-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.getAttribute('data-page')) === pageNum) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        // Ocultar spinner
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    };

    // --- CONTROL DE PAGINACIÓN CAPSUELA ---
    function initPaginationControls(totalPages) {
        const selectPage = document.getElementById('select-page-num');
        const totalSpan = document.getElementById('total-pages-span');
        
        if (totalSpan) totalSpan.textContent = totalPages;
        
        if (selectPage) {
            selectPage.innerHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                selectPage.appendChild(opt);
            }
            selectPage.value = window.pdfPageNum;
            
            // Escuchar cambios en el selector flotante
            selectPage.addEventListener('change', (e) => {
                window.changePdfPage(parseInt(e.target.value));
            });
        }
        
        // Escuchar clics en botones de paginación flotantes
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        
        if (btnPrev) {
            btnPrev.replaceWith(btnPrev.cloneNode(true)); // Limpiar listeners anteriores
            document.getElementById('btn-prev-page').addEventListener('click', () => {
                if (window.pdfPageNum > 1) {
                    window.changePdfPage(window.pdfPageNum - 1);
                }
            });
        }
        
        if (btnNext) {
            btnNext.replaceWith(btnNext.cloneNode(true)); // Limpiar listeners anteriores
            document.getElementById('btn-next-page').addEventListener('click', () => {
                if (window.pdfPageNum < totalPages) {
                    window.changePdfPage(window.pdfPageNum + 1);
                }
            });
        }
    }

    // --- GENERAR MINIATURAS EN BARRA LATERAL ---
    async function initSidebarThumbnails(pdf) {
        const pagesContainer = document.getElementById('pages-container');
        if (!pagesContainer) return;
        
        pagesContainer.innerHTML = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const pageItem = document.createElement('div');
            pageItem.className = 'sidebar-page-item';
            pageItem.setAttribute('data-page', i);
            if (i === window.pdfPageNum) pageItem.classList.add('active');
            
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.className = 'page-thumbnail-canvas';
            
            const label = document.createElement('span');
            label.className = 'page-label';
            label.textContent = `Pág. ${i}`;
            
            pageItem.appendChild(thumbCanvas);
            pageItem.appendChild(label);
            pagesContainer.appendChild(pageItem);
            
            // Clic en la miniatura para cambiar
            pageItem.addEventListener('click', () => {
                window.changePdfPage(i);
            });
            
            // Renderizar miniatura de forma asíncrona sin bloquear la carga principal
            (async (pageNum, canvasEl) => {
                try {
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 0.15 }); // Miniatura de bajo tamaño
                    
                    canvasEl.width = viewport.width;
                    canvasEl.height = viewport.height;
                    
                    const ctx = canvasEl.getContext('2d');
                    const renderContext = {
                        canvasContext: ctx,
                        viewport: viewport
                    };
                    await page.render(renderContext).promise;
                } catch (e) {
                    console.error(`Error renderizando miniatura para página ${pageNum}:`, e);
                }
            })(i, thumbCanvas);
        }
    }

    // --- 3. EXPORTACIÓN & CONFIRMACIONES ---
    const btnSaveDraft = document.getElementById('btn-save-draft');
    if (btnSaveDraft) {
        btnSaveDraft.addEventListener('click', () => {
            saveDraftSession();
        });
    }

    btnSavePdf.addEventListener('click', () => {
        if (!window.pdfBytes) return;
        
        const originalName = window.pdfFileName ? window.pdfFileName.replace('.pdf', '') : 'documento';
        const filename = `${originalName}_editado.pdf`;
        
        window.pendingExportFilename = filename;

        // Ejecutar validación de solapamientos
        if (window.editorModule && window.editorModule.hasCollisions()) {
            window.exportModule.showWarningBanner();
        } else {
            window.exportModule.exportModifiedPdf(filename);
        }
    });

    // Deseleccionar todo al pulsar en áreas vacías del PDF overlay
    const overlayEl = document.getElementById('pdf-overlay');
    if (overlayEl) {
        overlayEl.addEventListener('pointerdown', (e) => {
            if (e.target === overlayEl) {
                // Deseleccionar campos editables y quitar sus controles
                document.querySelectorAll('.editable-field-wrapper').forEach(w => {
                    w.classList.remove('active-focus');
                    const controls = w.querySelector('.quick-controls-wrapper');
                    if (controls) controls.remove();
                });
                // Deseleccionar otros estampados, correctores y casillas y remover sus botones de borrar
                document.querySelectorAll('.draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(el => {
                    el.classList.remove('active-focus');
                    const controls = el.querySelector('.quick-controls-wrapper');
                    if (controls) controls.remove();
                    const deleteBtn = el.querySelector('.btn-delete-element');
                    if (deleteBtn) deleteBtn.remove();
                });
            }
        });
    }

    // --- CAMBIO DE PÁGINA MEDIANTE SCROLL DEL RATÓN (MOUSE WHEEL) ---
    let scrollPageCooldown = false;
    const scroller = document.getElementById('pdf-scroller');
    if (scroller) {
        scroller.addEventListener('wheel', (e) => {
            if (!window.pdfInstance) return;
            if (scrollPageCooldown) return;

            const totalPages = window.pdfInstance.numPages;
            
            // Si scroll down (hacia abajo)
            if (e.deltaY > 0) {
                const isAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8;
                if (isAtBottom && window.pdfPageNum < totalPages) {
                    scrollPageCooldown = true;
                    window.changePdfPage(window.pdfPageNum + 1);
                    setTimeout(() => { scrollPageCooldown = false; }, 800); // 800ms de cooldown
                    e.preventDefault();
                }
            } 
            // Si scroll up (hacia arriba)
            else if (e.deltaY < 0) {
                const isAtTop = scroller.scrollTop <= 8;
                if (isAtTop && window.pdfPageNum > 1) {
                    scrollPageCooldown = true;
                    window.changePdfPage(window.pdfPageNum - 1);
                    // Poner el scroll al fondo al subir a la página anterior para continuar la lectura fluida
                    setTimeout(() => {
                        scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
                        scrollPageCooldown = false;
                    }, 100); 
                    setTimeout(() => { scrollPageCooldown = false; }, 800);
                    e.preventDefault();
                }
            }
        }, { passive: false });
    }

    // --- SISTEMA DE BORRADORES Y PERSISTENCIA (LOCALSTORAGE) ---
    function saveDraftSession() {
        if (!window.pdfInstance) return;
        
        if (window.syncDomTextToFields) window.syncDomTextToFields();

        const draft = {
            pdfFileName: window.pdfFileName || 'documento.pdf',
            pdfPageNum: window.pdfPageNum,
            fields: window.pdfFields || [],
            correctors: window.fillToolsModule ? window.fillToolsModule.getCorrectorPatches() : [],
            checkboxes: window.fillToolsModule ? window.fillToolsModule.getCheckboxes() : [],
            signatures: window.signaturesModule ? window.signaturesModule.getPlacedSignatures() : []
        };
        
        try {
            localStorage.setItem('pdfiller_draft', JSON.stringify(draft));
            showNotificationToast('¡Borrador guardado con éxito!');
        } catch (e) {
            console.error('Error al guardar el borrador en localStorage:', e);
            alert('No se pudo guardar el borrador en el navegador porque excede el espacio disponible (ej. firmas muy grandes).');
        }
    }

    async function restoreDraftSession() {
        const stored = localStorage.getItem('pdfiller_draft');
        if (!stored) return;

        try {
            const draft = JSON.parse(stored);
            if (!draft) return;

            const confirmRestore = confirm(`Se ha encontrado un borrador guardado del archivo "${draft.pdfFileName}". ¿Deseas restaurar tus cambios y continuar editando?`);
            if (!confirmRestore) {
                return;
            }

            console.log('Restaurando borrador del documento...', draft);
            
            window.pdfFields = draft.fields || [];
            
            if (window.fillToolsModule) {
                window.fillToolsModule.setCorrectorPatches(draft.correctors || []);
                window.fillToolsModule.setCheckboxes(draft.checkboxes || []);
            }
            
            if (window.signaturesModule) {
                window.signaturesModule.setPlacedSignatures(draft.signatures || []);
            }
            
            // Cambiar a la página guardada
            window.pdfPageNum = draft.pdfPageNum || 1;
            await window.changePdfPage(window.pdfPageNum);
            
            showNotificationToast('¡Borrador restaurado con éxito!');
        } catch (e) {
            console.error('Error al restaurar borrador:', e);
        }
    }

    window.showNotificationToast = function(message) {
        const toast = document.getElementById('toast-notification');
        const toastMsg = document.getElementById('toast-message');
        if (toast && toastMsg) {
            toastMsg.textContent = message;
            toast.classList.add('active');
            
            setTimeout(() => {
                toast.classList.remove('active');
            }, 3000); // Ocultar después de 3 segundos
        }
    };
});
