// PDFiller 2 - Fill Tools Module (Text Stamps, Corrector/Whiteout, Casillas de Relleno Inteligentes)
window.fillToolsModule = (() => {
    let activeTool = 'none'; // text, corrector, casilla, none
    
    // Selectores de Texto
    let selectedTextColor = 'auto'; // 'auto', hex
    let selectedTextSize = 'auto';  // 'auto', size

    // Selectores de Casillas
    let selectedCasillaSymbol = 'x';
    let selectedCasillaColor = '#0f172a';

    const correctorPatches = [];
    const checkboxes = [];

    // Referencias a UI
    const toolText = document.getElementById('tool-text');
    const toolCorrector = document.getElementById('tool-corrector');
    const toolCasilla = document.getElementById('tool-casilla');
    const workspace = document.getElementById('workspace-container');
    const overlay = document.getElementById('pdf-overlay');

    // Inicializar listeners de botones
    if (toolText) toolText.addEventListener('click', () => toggleTool('text'));
    if (toolCorrector) toolCorrector.addEventListener('click', () => toggleTool('corrector'));
    if (toolCasilla) {
        toolCasilla.addEventListener('click', () => toggleTool('casilla'));
    }

    // --- BIND DE SELECTORES DE AJUSTES EN PANELES ---
    // 1. Paleta de colores de Texto
    document.querySelectorAll('#text-color-palette .color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#text-color-palette .color-swatch').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTextColor = btn.getAttribute('data-color');
        });
    });

    // 2. Presets de tamaño de Texto
    document.querySelectorAll('#text-size-presets .size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#text-size-presets .size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTextSize = btn.getAttribute('data-size');
        });
    });

    // 5. Selectores de Casillas
    const casillaSymbolSelect = document.getElementById('casilla-symbol-select');
    if (casillaSymbolSelect) {
        casillaSymbolSelect.addEventListener('change', (e) => {
            selectedCasillaSymbol = e.target.value;
            
            // ACTUALIZAR DINÁMICAMENTE EL SÍMBOLO DE LA CASILLA SELECCIONADA CON FOCO ACTIVO
            const activeCb = document.querySelector('.draggable-checkbox-wrapper.active-focus');
            if (activeCb) {
                const cbId = activeCb.id;
                const cb = checkboxes.find(c => c.id === cbId);
                if (cb) {
                    cb.symbol = selectedCasillaSymbol;
                    const symbolDiv = activeCb.querySelector('.checkbox-symbol');
                    if (symbolDiv) {
                        updateCheckboxSymbolDOM(symbolDiv, cb);
                        updateCheckboxContrast(cb, symbolDiv);
                    }
                    if (window.historyManager) {
                        window.historyManager.saveState();
                    }
                    showPotentialCheckboxes();
                }
            }
        });
    }

    const toggleFormMode = document.getElementById('toggle-form-mode');
    if (toggleFormMode) {
        toggleFormMode.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('form-mode-active');
                if (activeTool === 'casilla') {
                    workspace.style.cursor = 'default';
                }
            } else {
                document.body.classList.remove('form-mode-active');
                if (activeTool === 'casilla') {
                    workspace.style.cursor = 'crosshair';
                }
            }
        });
    }

    // Gestión de Estados de Herramientas
    const toggleTool = (tool) => {
        [toolText, toolCorrector, toolCasilla].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        const settingsBar = document.getElementById('fill-tool-settings');
        const textOptions = document.getElementById('text-tool-options');
        const casillaOptions = document.getElementById('casilla-tool-options');
        
        if (settingsBar) settingsBar.style.display = 'none';
        if (textOptions) textOptions.style.display = 'none';
        if (casillaOptions) casillaOptions.style.display = 'none';

        if (activeTool === tool) {
            activeTool = 'none';
            workspace.style.cursor = 'default';
            clearPotentialCheckboxes();
        } else {
            activeTool = tool;
            
            const formMode = toggleFormMode?.checked || false;
            if (tool === 'casilla' && formMode) {
                workspace.style.cursor = 'default';
            } else {
                workspace.style.cursor = 'crosshair';
            }
            
            // Clear placeholders from other modes
            clearPotentialCheckboxes();
            
            if (tool === 'text') {
                if (toolText) toolText.classList.add('active');
                if (settingsBar) settingsBar.style.display = 'block';
                if (textOptions) textOptions.style.display = 'block';
            }
            if (tool === 'corrector') {
                if (toolCorrector) toolCorrector.classList.add('active');
            }
            if (tool === 'casilla') {
                if (toolCasilla) toolCasilla.classList.add('active');
                if (settingsBar) settingsBar.style.display = 'block';
                if (casillaOptions) casillaOptions.style.display = 'block';
                showPotentialCheckboxes();
            }
        }
        
        // Sincronizar clases del body con la herramienta de relleno activa
        document.body.classList.remove('text-tool-active', 'corrector-tool-active', 'casilla-tool-active');
        if (activeTool === 'text') {
            document.body.classList.add('text-tool-active');
        } else if (activeTool === 'corrector') {
            document.body.classList.add('corrector-tool-active');
        } else if (activeTool === 'casilla') {
            document.body.classList.add('casilla-tool-active');
        }
        
        console.log(`Herramienta de Relleno activa: ${activeTool}`);
    };

    // ESCUCHAR CLICS EN EL OVERLAY DEL PDF PARA APLICAR LAS HERRAMIENTAS
    overlay.addEventListener('click', (e) => {
        if (e.target !== overlay) return;

        // Si hay algún campo seleccionado/enfocado, deseleccionarlo primero y no aplicar la herramienta
        const activeSel = document.querySelector('.editable-field-wrapper.active-focus, .draggable-stamp.active-focus, .corrector-patch.active-focus, .draggable-checkbox-wrapper.active-focus');
        if (activeSel) {
            if (window.editorModule && window.editorModule.clearAllSelections) {
                window.editorModule.clearAllSelections();
            }
            return; // Evitar crear nuevos stamps/casillas en este click
        }

        if (activeTool === 'none' || window.currentTool !== 'none') return;

        // Calcular posición relativa al overlay (normalizada por el zoom)
        const rect = overlay.getBoundingClientRect();
        const zoom = window.viewportZoom || 1.0;
        const x = (e.clientX - rect.left) / zoom;
        const y = (e.clientY - rect.top) / zoom;

        if (activeTool === 'text') {
            detectFontAtCoordinates(window.pdfPageNum || 1, x, y).then(detected => {
                let customStyles = null;
                if (detected) {
                    const supportedFont = mapFontToSupported(detected.fontName);
                    const sizeClamped = Math.max(8, Math.min(40, detected.fontSize));
                    
                    customStyles = {
                        fontSize: sizeClamped
                    };
                    
                    if (supportedFont) {
                        customStyles.fontFamily = supportedFont;
                        const fontSelect = document.getElementById('text-font-select');
                        if (fontSelect) {
                            fontSelect.value = supportedFont;
                        }
                    }
                    
                    const sizeSelect = document.getElementById('text-size-select');
                    if (sizeSelect) {
                        let hasOption = false;
                        for (let i = 0; i < sizeSelect.options.length; i++) {
                            if (parseInt(sizeSelect.options[i].value) === sizeClamped) {
                                hasOption = true;
                                break;
                            }
                        }
                        if (!hasOption) {
                            const opt = document.createElement('option');
                            opt.value = sizeClamped;
                            opt.textContent = `${sizeClamped} px`;
                            sizeSelect.appendChild(opt);
                        }
                        sizeSelect.value = sizeClamped.toString();
                    }
                    
                    if (window.showNotificationToast) {
                        window.showNotificationToast(`Cuentagotas: ${detected.fontName} (${detected.fontSize}px)`);
                    }
                }
                createTextStamp(x, y, customStyles);
            });
        } else if (activeTool === 'corrector') {
            // LECTURA DE PÍXEL INTELIGENTE (CUENTAGOTAS EN CANVAS)
            const canvas = document.getElementById('pdf-canvas');
            let detectedColor = '#ffffff'; // Fallback por defecto (blanco)
            
            if (canvas) {
                try {
                    const ctx = canvas.getContext('2d');
                    const canvasRect = canvas.getBoundingClientRect();
                    
                    // Escalar coordenadas del click al canvas real
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    
                    // Calcular posición relativa respecto al Canvas
                    const canvasClickX = (e.clientX - canvasRect.left) * scaleX;
                    const canvasClickY = (e.clientY - canvasRect.top) * scaleY;
                    
                    const pixel = ctx.getImageData(canvasClickX, canvasClickY, 1, 1).data;
                    const r = pixel[0];
                    const g = pixel[1];
                    const b = pixel[2];
                    const alpha = pixel[3];
                    
                    if (alpha > 50) { // Validar píxel visible
                        detectedColor = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                    }
                } catch (err) {
                    console.warn('Error al leer el píxel del Canvas (Fallback a blanco):', err);
                }
            }
            createCorrectorPatch(x, y, detectedColor);
        } else if (activeTool === 'casilla') {
            createCheckbox(x, y, selectedCasillaSymbol); // Crear e inmediatamente rellenar con la cruz
        }
    });

    // Inyectar el botón redondo flotante de eliminación rápida
    const injectDeleteButton = (wrapper, fieldId) => {
        if (wrapper.querySelector('.btn-delete-element')) return;
        
        const btn = document.createElement('button');
        btn.className = 'btn-delete-element';
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        btn.title = 'Eliminar este elemento';
        
        const performDelete = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.historyManager) {
                window.historyManager.deleteElement(fieldId);
            }
        };

        btn.addEventListener('click', performDelete);
        btn.addEventListener('pointerdown', performDelete); // Borrar en pointerdown para evitar bloqueos táctiles o de interact.js
        
        wrapper.appendChild(btn);
    };

    // Redimensionado dinámico horizontal y vertical premium
    const updateFieldDimensions = (input, wrapper, field) => {
        const text = input.innerText || input.textContent || '';
        
        if (text.includes('\n') || text.includes('\r')) {
            input.style.whiteSpace = 'pre-wrap';
        } else {
            input.style.whiteSpace = 'pre';
        }
        
        input.style.width = 'auto';
        input.style.height = 'auto';
        
        const measuredWidth = Math.max(input.scrollWidth + 12, 40);
        const measuredHeight = Math.max(input.scrollHeight + 4, 18);
        
        field.width = measuredWidth;
        field.height = measuredHeight;
        
        wrapper.style.width = `${measuredWidth}px`;
        wrapper.style.height = `${measuredHeight}px`;
        
        input.style.width = '100%';
        input.style.height = '100%';
    };

    // --- 1. ESTAMPAR NUEVO TEXTO LIBRE ---
    const createTextStamp = (x, y, customStyles = null) => {
        console.log(`Estampando texto libre en: ${x}, ${y}`);
        
        const fontSelect = document.getElementById('text-font-select');
        const sizeSelect = document.getElementById('text-size-select');
        const colorSelect = document.getElementById('text-color-select');
        const bgSelect = document.getElementById('text-bg-select');

        // Extraer valores seleccionados
        let selFont = fontSelect ? fontSelect.value : 'Inter';
        let selSize = sizeSelect ? sizeSelect.value : 'auto';
        let selColor = colorSelect ? colorSelect.value : 'auto';
        let selBg = bgSelect ? bgSelect.value : 'auto';

        if (customStyles) {
            if (customStyles.fontFamily) {
                selFont = customStyles.fontFamily;
            }
            if (customStyles.fontSize) {
                selSize = customStyles.fontSize.toString();
            }
        }

        // Lógica de auto-detección según la posición vertical Y
        const overlayHeight = overlay.clientHeight || 1000;
        const yPercent = (y / overlayHeight) * 100;

        let finalColor = '#0f172a';
        let finalSize = 12;
        let finalBg = 'light';
        let finalFontName = 'Helvetica';

        if (selColor === 'auto') {
            finalColor = yPercent < 22 ? '#ffffff' : '#0f172a';
        } else {
            finalColor = selColor;
        }

        if (selSize === 'auto') {
            finalSize = yPercent < 22 ? 14 : 10;
        } else {
            finalSize = parseInt(selSize);
        }

        if (selBg === 'auto') {
            finalBg = yPercent < 22 ? 'dark' : 'light';
        } else {
            finalBg = selBg;
        }

        // Determinar nombre del font interno
        if (selFont === 'Calibri' || selFont === 'Verdana' || selFont === 'Arial' || selFont === 'Helvetica' || selFont === 'Times New Roman' || selFont === 'Courier New' || selFont === 'Quicksand' || selFont === 'Inter') {
            finalFontName = selFont;
        } else if (selFont.includes('Courier')) {
            finalFontName = 'Courier';
        } else if (selFont.includes('Georgia') || selFont.includes('Times')) {
            finalFontName = 'Times-Roman';
        } else {
            finalFontName = yPercent < 22 ? 'Helvetica-Bold' : 'Helvetica';
        }

        let posX = x;
        let posY = y;
        if (overlay) {
            const maxW = overlay.clientWidth;
            const maxH = overlay.clientHeight;
            posX = Math.max(0, Math.min(posX, maxW - 100));
            posY = Math.max(0, Math.min(posY, maxH - 22));
        }

        const stampId = `text_stamp_${Date.now()}`;
        
        // Registrar en modelo global
        const stampData = {
            id: stampId,
            text: 'Nuevo Texto...',
            x: posX,
            y: posY,
            width: 100, // Anchura y altura iniciales
            height: 22,
            fontSize: finalSize,
            fontName: finalFontName,
            originalFontSize: finalSize / window.pdfScale,
            color: finalColor,
            sectionKey: finalBg === 'dark' ? 'cabecera' : (finalBg === 'gray' ? 'tabla' : 'datos'),
            isStamp: true,
            locked: false, // ¡DESBLOQUEADO POR DEFECTO PARA ARRASTRAR Y SITUAR!
            pageNum: window.pdfPageNum || 1
        };

        if (window.pdfFields) {
            window.pdfFields.push(stampData);
        }
 
        // Desactivar herramienta
        toggleTool('none');
        
        // Guardar estado y redibujar UI para unificar controles
        if (window.historyManager) {
            window.historyManager.saveState();
            window.historyManager.reRenderUI();
        }

        // Foco inmediato al campo recién creado
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
    };

    // --- 3. DIBUJAR CORRECTOR EN OVERLAY ---
    const drawCorrectorPatchOnOverlay = (patchData) => {
        const el = document.createElement('div');
        el.id = patchData.id;
        el.className = 'corrector-patch';
        el.style.left = `${patchData.x}px`;
        el.style.top = `${patchData.y}px`;
        el.style.width = `${patchData.width}px`;
        el.style.height = `${patchData.height}px`;
        el.style.backgroundColor = patchData.color || '#ffffff';

        // Inyectar botón de borrar
        injectDeleteButton(el, patchData.id);

        overlay.appendChild(el);

        let posX = patchData.x;
        let posY = patchData.y;
        let w = patchData.width;
        let h = patchData.height;

        // Selección del corrector al hacer clic (para nudging)
        el.addEventListener('pointerdown', (e) => {
            document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch').forEach(w => w.classList.remove('active-focus'));
            el.classList.add('active-focus');
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        });

        interact(el)
            .draggable({
                listeners: {
                    start(event) {
                        const isRellenar = document.body.classList.contains('fill-mode-active');
                        if (isRellenar && activeTool !== 'corrector' && !el.classList.contains('active-focus')) {
                            event.interaction.stop();
                            return;
                        }
                        el.classList.add('active-focus');
                        // Evitar saltos de posición (stale closure) re-leyendo los valores reales de CSS
                        posX = parseFloat(el.style.left) || patchData.x;
                        posY = parseFloat(el.style.top) || patchData.y;
                    },
                    move(event) {
                        const zoom = window.viewportZoom || 1.0;
                        let nextX = posX + event.dx / zoom;
                        let nextY = posY + event.dy / zoom;
                        
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            const patchW = parseFloat(el.style.width) || patchData.width;
                            const patchH = parseFloat(el.style.height) || patchData.height;
                            
                            nextX = Math.max(0, Math.min(nextX, maxW - patchW));
                            nextY = Math.max(0, Math.min(nextY, maxH - patchH));
                        }
                        
                        posX = nextX;
                        posY = nextY;
                        el.style.left = `${posX}px`;
                        el.style.top = `${posY}px`;
                        
                        patchData.x = posX;
                        patchData.y = posY;
                    },
                    end() {
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            const patchW = parseFloat(el.style.width) || patchData.width;
                            const patchH = parseFloat(el.style.height) || patchData.height;
                            posX = Math.max(0, Math.min(posX, maxW - patchW));
                            posY = Math.max(0, Math.min(posY, maxH - patchH));
                        }
                        el.style.left = `${posX}px`;
                        el.style.top = `${posY}px`;
                        patchData.x = posX;
                        patchData.y = posY;

                        el.classList.remove('active-focus');
                        if (window.historyManager) window.historyManager.saveState();
                    }
                }
            })
            .resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                margin: 12,
                listeners: {
                    start(event) {
                        const isRellenar = document.body.classList.contains('fill-mode-active');
                        if (isRellenar && activeTool !== 'corrector' && !el.classList.contains('active-focus')) {
                            event.interaction.stop();
                            return;
                        }
                        el.classList.add('active-focus');
                        // Evitar saltos leyendo tamaño y posición reales de CSS
                        posX = parseFloat(el.style.left) || patchData.x;
                        posY = parseFloat(el.style.top) || patchData.y;
                        w = parseFloat(el.style.width) || patchData.width;
                        h = parseFloat(el.style.height) || patchData.height;
                    },
                    move(event) {
                        const zoom = window.viewportZoom || 1.0;
                        let { x: dx, y: dy } = event.deltaRect;

                        posX += dx / zoom;
                        posY += dy / zoom;
                        w = event.rect.width / zoom;
                        h = event.rect.height / zoom;

                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            
                            if (posX < 0) {
                                w = w + posX;
                                posX = 0;
                            }
                            if (posY < 0) {
                                h = h + posY;
                                posY = 0;
                            }
                            
                            if (posX + w > maxW) {
                                w = maxW - posX;
                            }
                            if (posY + h > maxH) {
                                h = maxH - posY;
                            }

                            w = Math.min(w, maxW);
                            h = Math.min(h, maxH);
                            w = Math.max(10, w);
                            h = Math.max(10, h);
                        }

                        el.style.left = `${posX}px`;
                        el.style.top = `${posY}px`;
                        el.style.width = `${w}px`;
                        el.style.height = `${h}px`;

                        patchData.x = posX;
                        patchData.y = posY;
                        patchData.width = w;
                        patchData.height = h;
                    },
                    end() {
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            posX = Math.max(0, Math.min(posX, maxW - w));
                            posY = Math.max(0, Math.min(posY, maxH - h));
                        }
                        el.style.left = `${posX}px`;
                        el.style.top = `${posY}px`;
                        el.style.width = `${w}px`;
                        el.style.height = `${h}px`;

                        patchData.x = posX;
                        patchData.y = posY;
                        patchData.width = w;
                        patchData.height = h;

                        el.classList.remove('active-focus');
                        if (window.historyManager) window.historyManager.saveState();
                    }
                }
            });
    };

    const createCorrectorPatch = (x, y, color) => {
        let posX = x;
        let posY = y;
        if (overlay) {
            const maxW = overlay.clientWidth;
            const maxH = overlay.clientHeight;
            posX = Math.max(0, Math.min(posX, maxW - 80));
            posY = Math.max(0, Math.min(posY, maxH - 20));
        }

        const patchId = `corrector_patch_${Date.now()}`;
        const patchData = {
            id: patchId,
            x: posX,
            y: posY,
            width: 80,
            height: 20,
            color: color,
            pageNum: window.pdfPageNum || 1
        };

        correctorPatches.push(patchData);
        drawCorrectorPatchOnOverlay(patchData);

        // Desactivar la herramienta tras crear un parche
        toggleTool('none');

        if (window.historyManager) window.historyManager.saveState();

        // Foco visual inmediato al corrector recién creado para que se pueda manipular al instante
        setTimeout(() => {
            const el = document.getElementById(patchId);
            if (el) {
                document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch').forEach(w => w.classList.remove('active-focus'));
                el.classList.add('active-focus');
            }
        }, 120);
    };

    const detectCheckboxBounds = (canvas, cx, cy) => {
        const ctx = canvas.getContext('2d');
        const searchRadius = 25; // Escaneo en región de 50x50 píxeles alrededor del clic
        const scanWidth = searchRadius * 2;
        const scanHeight = searchRadius * 2;
        
        // Clampear inicio de lectura para evitar errores fuera de límites del canvas
        const startX = Math.max(0, Math.min(canvas.width - scanWidth, Math.round(cx - searchRadius)));
        const startY = Math.max(0, Math.min(canvas.height - scanHeight, Math.round(cy - searchRadius)));
        
        try {
            const imgData = ctx.getImageData(startX, startY, scanWidth, scanHeight);
            const data = imgData.data;
            
            // Función auxiliar para obtener brillo en coordenadas locales de la subimagen
            const getLocalBrightness = (lx, ly) => {
                if (lx < 0 || lx >= scanWidth || ly < 0 || ly >= scanHeight) return 255;
                const idx = (ly * scanWidth + lx) * 4;
                const r = data[idx];
                const g = data[idx+1];
                const b = data[idx+2];
                const a = data[idx+3];
                if (a < 50) return 255; // Transparente -> blanco
                return (r + g + b) / 3;
            };

            const candidates = [];
            const step = 4; // Muestreo fino dentro del área de clic
            
            for (let ly = 10; ly < scanHeight - 10; ly += step) {
                for (let lx = 10; lx < scanWidth - 10; lx += step) {
                    // Si el punto inicial es oscuro, omitir (no estamos dentro del checkbox blanco)
                    if (getLocalBrightness(lx, ly) < 200) continue;

                    // Escanear bordes
                    let left = lx;
                    while (left > 0 && getLocalBrightness(left, ly) > 170) left--;
                    
                    let right = lx;
                    while (right < scanWidth - 1 && getLocalBrightness(right, ly) > 170) right++;
                    
                    let top = ly;
                    while (top > 0 && getLocalBrightness(lx, top) > 170) top--;
                    
                    let bottom = ly;
                    while (bottom < scanHeight - 1 && getLocalBrightness(lx, bottom) > 170) bottom++;

                    const w = right - left;
                    const h = bottom - top;

                    const foundLeft = left > 0;
                    const foundRight = right < scanWidth - 1;
                    const foundTop = top > 0;
                    const foundBottom = bottom < scanHeight - 1;

                    if (!foundLeft || !foundRight || !foundTop || !foundBottom) continue;

                    const aspectRatio = w / h;
                    if (aspectRatio < 0.75 || aspectRatio > 1.35) continue;

                    // Dimensiones típicas de casillas de formulario (entre 8 y 25px para mayor precisión)
                    if (w >= 8 && w <= 25 && h >= 8 && h <= 25) {
                        candidates.push({
                            x: startX + left,
                            y: startY + top,
                            width: w,
                            height: h
                        });
                    }
                }
            }

            if (candidates.length === 0) return null;

            // Ordenar los candidatos por su área de forma ascendente
            // La casilla pequeña (checkbox) siempre tendrá menor área que la celda de la tabla
            candidates.sort((a, b) => (a.width * a.height) - (b.width * b.height));

            const smallest = candidates[0];
            // Utilizar el tamaño inline unificado de pdf-viewport (unscaled layout px)
            // para evitar cualquier deriva de clientWidth/getBoundingClientRect por escalado de CSS.
            const viewportEl = document.getElementById('pdf-viewport');
            const unscaledWidth = parseFloat(viewportEl?.style.width) || canvas.width;
            const unscaledHeight = parseFloat(viewportEl?.style.height) || canvas.height;
            const scaleX = unscaledWidth / canvas.width;
            const scaleY = unscaledHeight / canvas.height;

            return {
                x: smallest.x * scaleX,
                y: smallest.y * scaleY,
                width: smallest.width * scaleX,
                height: smallest.height * scaleY
            };
        } catch (e) {
            console.warn('Error al auto-detectar bordes de casilla local:', e);
        }
        return null;
    };

    const createCheckbox = (x, y, initialSymbol = 'none') => {
        let cbData = null;
        let finalColor = '#0f172a'; // pizarra por defecto
        
        // Intentar auto-detectar bordes de casilla impresa en el canvas de fondo
        const canvas = document.getElementById('pdf-canvas');
        if (canvas) {
            try {
                // Utilizar el tamaño inline unificado de pdf-viewport (unscaled layout px)
                const viewportEl = document.getElementById('pdf-viewport');
                const unscaledWidth = parseFloat(viewportEl?.style.width) || canvas.width;
                const unscaledHeight = parseFloat(viewportEl?.style.height) || canvas.height;
                const scaleX = canvas.width / unscaledWidth;
                const scaleY = canvas.height / unscaledHeight;
                
                // Calcular coordenadas del click relativas al canvas
                const cx = x * scaleX;
                const cy = y * scaleY;
                
                // Leer el píxel exacto del fondo en la coordenada del click
                const ctx = canvas.getContext('2d');
                const pixel = ctx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
                const r = pixel[0];
                const g = pixel[1];
                const b = pixel[2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Contraste automático W3C
                finalColor = luminance > 130 ? '#0f172a' : '#ffffff';
                console.log(`[ContrasteCasilla] Fondo: RGB(${r},${g},${b}) -> Luminancia: ${luminance.toFixed(1)} -> Color auto-ajustado: ${finalColor}`);
                
                const bounds = detectCheckboxBounds(canvas, cx, cy);
                if (bounds) {
                    let bx = bounds.x;
                    let by = bounds.y;
                    let bw = bounds.width;
                    let bh = bounds.height;
                    
                    const overlay = document.getElementById('pdf-overlay');
                    if (overlay) {
                        const maxW = overlay.clientWidth;
                        const maxH = overlay.clientHeight;
                        
                        bw = Math.min(bw, maxW);
                        bh = Math.min(bh, maxH);
                        
                        if (bx + bw > maxW) bx = maxW - bw;
                        if (bx < 0) bx = 0;
                        
                        if (by + bh > maxH) by = maxH - bh;
                        if (by < 0) by = 0;
                    }
                    
                    cbData = {
                        id: `checkbox_${Date.now()}`,
                        x: bx,
                        y: by,
                        width: bw,
                        height: bh,
                        symbol: initialSymbol,
                        color: finalColor, // COLOR POR CONTRASTE AUTOMÁTICO
                        pageNum: window.pdfPageNum || 1
                    };
                    console.log('¡Casilla impresa auto-detectada y alineada con precisión!', bounds);
                }
            } catch (err) {
                console.warn('Fallo al auto-detectar casilla impresa:', err);
            }
        }
        
        // Restricción estricta: Si no se encuentra un cuadro impreso visible, NO se aplica la casilla
        if (!cbData) {
            console.log('[Casilla] No se detectó ninguna casilla impresa visible en el documento original. Creación omitida.');
            return;
        }

        // Evitar duplicados si ya existe una casilla cerca de los bounds detectados
        const activePageNum = window.pdfPageNum || 1;
        const pageCheckboxes = checkboxes.filter(cb => Number(cb.pageNum || 1) === Number(activePageNum));
        const centerX = cbData.x + cbData.width / 2;
        const centerY = cbData.y + cbData.height / 2;
        const existing = pageCheckboxes.find(cb => {
            const cbCenterX = cb.x + cb.width / 2;
            const cbCenterY = cb.y + cb.height / 2;
            const dist = Math.sqrt((centerX - cbCenterX) ** 2 + (centerY - cbCenterY) ** 2);
            return dist < 14;
        });

        if (existing) {
            console.log('[Casilla] Ya existe una casilla en esta posición. Omitiendo duplicado.');
            if (initialSymbol !== 'none') {
                existing.symbol = initialSymbol;
                const elCb = document.getElementById(existing.id);
                if (elCb) {
                    const symbolDiv = elCb.querySelector('.checkbox-symbol');
                    if (symbolDiv) {
                        updateCheckboxSymbolDOM(symbolDiv, existing);
                        updateCheckboxContrast(existing, symbolDiv);
                    }
                }
                if (window.historyManager) window.historyManager.saveState();
            }
            return;
        }
        
        checkboxes.push(cbData);
        drawCheckboxOnOverlay(cbData);
        if (window.historyManager) window.historyManager.saveState();

        // Poner foco inmediato
        const el = document.getElementById(cbData.id);
        if (el) {
            document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(w => w.classList.remove('active-focus'));
            el.classList.add('active-focus');
        }
    };

    const updateCheckboxContrast = (cb, symbolDiv) => {
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;
        
        try {
            // Utilizar el tamaño inline unificado de pdf-viewport (unscaled layout px)
            const viewportEl = document.getElementById('pdf-viewport');
            const unscaledWidth = parseFloat(viewportEl?.style.width) || canvas.width;
            const unscaledHeight = parseFloat(viewportEl?.style.height) || canvas.height;
            const scaleX = canvas.width / unscaledWidth;
            const scaleY = canvas.height / unscaledHeight;
            
            // Medir el centro de la casilla
            const cx = (cb.x + cb.width / 2) * scaleX;
            const cy = (cb.y + cb.height / 2) * scaleY;
            
            const ctx = canvas.getContext('2d');
            const pixel = ctx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
            const r = pixel[0];
            const g = pixel[1];
            const b = pixel[2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            
            cb.color = luminance > 130 ? '#0f172a' : '#ffffff';
            if (symbolDiv) {
                updateCheckboxSymbolDOM(symbolDiv, cb);
            }
            console.log(`[ContrasteCasilla] Casilla ${cb.id} fondo: RGB(${r},${g},${b}) -> Luminancia: ${luminance.toFixed(1)} -> Color auto-ajustado: ${cb.color}`);
        } catch (e) {
            console.warn('Error al auto-calcular contraste de casilla:', e);
        }
    };

    const drawCheckboxOnOverlay = (cb) => {
        if (document.getElementById(cb.id)) return; // Evitar duplicados

        const el = document.createElement('div');
        el.id = cb.id;
        el.className = 'draggable-checkbox-wrapper';
        el.style.left = `${cb.x}px`;
        el.style.top = `${cb.y}px`;
        el.style.width = `${cb.width}px`;
        el.style.height = `${cb.height}px`;

        // Renderizar el símbolo
        const symbolDiv = document.createElement('div');
        symbolDiv.className = 'checkbox-symbol';
        el.appendChild(symbolDiv);

        // Calcular el contraste de inmediato para la renderización inicial
        updateCheckboxContrast(cb, symbolDiv);

        // Inyectar el botón de eliminación de forma permanente para que siempre esté listo
        injectDeleteButton(el, cb.id);

        overlay.appendChild(el);

        // Selección e interactividad
        el.addEventListener('pointerdown', (e) => {
            // Deseleccionar otros elementos y activar foco en este
            document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(w => w.classList.remove('active-focus'));
            el.classList.add('active-focus');

            const isCasillaToolActive = (activeTool === 'casilla');
            
            if (isCasillaToolActive) {
                e.stopPropagation();
                e.preventDefault();
                
                // Conmutar el símbolo
                if (cb.symbol === 'x') {
                    cb.symbol = 'none';
                } else {
                    cb.symbol = 'x';
                }
                
                // Actualizar visualmente y contrastes inmediatamente
                updateCheckboxContrast(cb, symbolDiv);

                if (window.historyManager) window.historyManager.saveState();
                showPotentialCheckboxes(); // Actualizar placeholders
            } else {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }
        });

        // Configuración de arrastre y redimensionado
        let posX = cb.x;
        let posY = cb.y;
        let w = cb.width;
        let h = cb.height;

        if (typeof interact !== 'undefined') {
            interact(el)
                .draggable({
                    listeners: {
                        start(event) {
                            const isCasillaToolActive = (activeTool === 'casilla');
                            if (isCasillaToolActive) {
                                event.interaction.stop();
                                return;
                            }
                            el.classList.add('active-focus');
                            posX = parseFloat(el.style.left) || cb.x;
                            posY = parseFloat(el.style.top) || cb.y;
                        },
                        move(event) {
                            const zoom = window.viewportZoom || 1.0;
                            let nextX = posX + event.dx / zoom;
                            let nextY = posY + event.dy / zoom;

                            const overlay = document.getElementById('pdf-overlay');
                            if (overlay) {
                                const maxW = overlay.clientWidth;
                                const maxH = overlay.clientHeight;
                                const cbW = parseFloat(el.style.width) || cb.width;
                                const cbH = parseFloat(el.style.height) || cb.height;

                                nextX = Math.max(0, Math.min(nextX, maxW - cbW));
                                nextY = Math.max(0, Math.min(nextY, maxH - cbH));
                            }

                            posX = nextX;
                            posY = nextY;
                            el.style.left = `${posX}px`;
                            el.style.top = `${posY}px`;
                            cb.x = posX;
                            cb.y = posY;
                        },
                        end() {
                            const overlay = document.getElementById('pdf-overlay');
                            if (overlay) {
                                const maxW = overlay.clientWidth;
                                const maxH = overlay.clientHeight;
                                const cbW = parseFloat(el.style.width) || cb.width;
                                const cbH = parseFloat(el.style.height) || cb.height;
                                posX = Math.max(0, Math.min(posX, maxW - cbW));
                                posY = Math.max(0, Math.min(posY, maxH - cbH));
                            }
                            el.style.left = `${posX}px`;
                            el.style.top = `${posY}px`;
                            cb.x = posX;
                            cb.y = posY;

                            el.classList.remove('active-focus');
                            updateCheckboxContrast(cb, symbolDiv);
                            if (window.historyManager) window.historyManager.saveState();
                            showPotentialCheckboxes(); // REFRESH PLACEHOLDERS EN TIEMPO REAL!
                        }
                    }
                })
                .resizable({
                    edges: { left: true, right: true, bottom: true, top: true },
                    listeners: {
                        start(event) {
                            const isCasillaToolActive = (activeTool === 'casilla');
                            if (isCasillaToolActive) {
                                event.interaction.stop();
                                return;
                            }
                            el.classList.add('active-focus');
                            posX = parseFloat(el.style.left) || cb.x;
                            posY = parseFloat(el.style.top) || cb.y;
                            w = parseFloat(el.style.width) || cb.width;
                            h = parseFloat(el.style.height) || cb.height;
                        },
                        move(event) {
                            const zoom = window.viewportZoom || 1.0;
                            let { x: dx, y: dy } = event.deltaRect;
                            
                            posX += dx / zoom;
                            posY += dy / zoom;
                            w = event.rect.width / zoom;
                            h = event.rect.height / zoom;
 
                            const overlay = document.getElementById('pdf-overlay');
                            if (overlay) {
                                const maxW = overlay.clientWidth;
                                const maxH = overlay.clientHeight;

                                if (posX < 0) {
                                    w = w + posX;
                                    posX = 0;
                                }
                                if (posY < 0) {
                                    h = h + posY;
                                    posY = 0;
                                }

                                if (posX + w > maxW) {
                                    w = maxW - posX;
                                }
                                if (posY + h > maxH) {
                                    h = maxH - posY;
                                }
                            }
 
                            const size = Math.max(10, Math.min(w, h));
                            
                            el.style.left = `${posX}px`;
                            el.style.top = `${posY}px`;
                            el.style.width = `${size}px`;
                            el.style.height = `${size}px`;
 
                            cb.x = posX;
                            cb.y = posY;
                            cb.width = size;
                            cb.height = size;
                        },
                        end() {
                            const overlay = document.getElementById('pdf-overlay');
                            if (overlay) {
                                const maxW = overlay.clientWidth;
                                const maxH = overlay.clientHeight;
                                const size = cb.width;
                                posX = Math.max(0, Math.min(posX, maxW - size));
                                posY = Math.max(0, Math.min(posY, maxH - size));
                            }
                            el.style.left = `${posX}px`;
                            el.style.top = `${posY}px`;
                            el.style.width = `${cb.width}px`;
                            el.style.height = `${cb.height}px`;
                            cb.x = posX;
                            cb.y = posY;

                            el.classList.remove('active-focus');
                            updateCheckboxContrast(cb, symbolDiv);
                            if (window.historyManager) window.historyManager.saveState();
                            showPotentialCheckboxes(); // REFRESH PLACEHOLDERS EN TIEMPO REAL!
                        }
                    }
                });
        }
    };

    const updateCheckboxSymbolDOM = (symbolDiv, cb) => {
        symbolDiv.innerHTML = '';
        // Símbolo proporcionalmente ajustado al tamaño de la casilla (75% del ancho) para equilibrio visual interior
        const symbolSize = Math.max(8, Math.round(cb.width * 0.75));
        if (cb.symbol === 'check') {
            symbolDiv.innerHTML = `<i class="fa-solid fa-check" style="color: ${cb.color}; font-size: ${symbolSize}px;"></i>`;
        } else if (cb.symbol === 'x') {
            symbolDiv.innerHTML = `<i class="fa-solid fa-xmark" style="color: ${cb.color}; font-size: ${symbolSize}px;"></i>`;
        } else if (cb.symbol === 'dot') {
            symbolDiv.innerHTML = `<i class="fa-solid fa-circle" style="color: ${cb.color}; font-size: ${symbolSize}px;"></i>`;
        }
    };

    // Limpiar en caliente duplicados de casillas en la misma coordenada
    const cleanDuplicateCheckboxes = () => {
        const unique = [];
        for (const cb of checkboxes) {
            const cbCenterX = cb.x + cb.width / 2;
            const cbCenterY = cb.y + cb.height / 2;
            const activePage = cb.pageNum || 1;
            
            const isDuplicate = unique.some(u => {
                if (Number(u.pageNum || 1) !== Number(activePage)) return false;
                const uCenterX = u.x + u.width / 2;
                const uCenterY = u.y + u.height / 2;
                const dist = Math.sqrt((cbCenterX - uCenterX) ** 2 + (cbCenterY - uCenterY) ** 2);
                return dist < 14;
            });
            
            if (!isDuplicate) {
                unique.push(cb);
            }
        }
        
        if (unique.length < checkboxes.length) {
            console.log(`[CasillaCleaner] Se eliminaron ${checkboxes.length - unique.length} casillas duplicadas.`);
            checkboxes.length = 0;
            unique.forEach(cb => checkboxes.push(cb));
        }
    };

    // --- RE-RENDERING GLOBAL TRAS UNDO/REDO ---
    const renderPlacedTools = () => {
        // Limpiar en caliente duplicados heredados de estados previos
        cleanDuplicateCheckboxes();

        // Renderizar correctores y casillas de la página activa
        correctorPatches.forEach(patch => {
            if (Number(patch.pageNum || 1) === Number(window.pdfPageNum) || patch.pageNum === undefined) {
                drawCorrectorPatchOnOverlay(patch);
            }
        });
        checkboxes.forEach(cb => {
            if (Number(cb.pageNum || 1) === Number(window.pdfPageNum) || cb.pageNum === undefined) {
                drawCheckboxOnOverlay(cb);
            }
        });
        // Si la herramienta Casilla está activa, refrescar placeholders verdes
        showPotentialCheckboxes();
    };

    // --- ALGORITMOS DE ESCANEO DE CASILLAS PREDICTIVAS ---
    const detectCheckboxBoundsFromFullData = (fullImgData, canvasWidth, canvasHeight, cx, cy) => {
        const data = fullImgData.data;
        const boxSize = 60; // Buscar en un área de 60x60 píxeles
        const half = boxSize / 2;
        const startX = Math.round(cx - half);
        const startY = Math.round(cy - half);

        // Helper para calcular brillo del pixel en coordenadas globales del canvas (x, y)
        const getCanvasBrightness = (x, y) => {
            if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) return 255;
            const idx = (y * canvasWidth + x) * 4;
            const r = data[idx];
            const g = data[idx+1];
            const b = data[idx+2];
            const a = data[idx+3];
            if (a < 50) return 255; // Transparente es tratado como fondo blanco
            return (r + g + b) / 3;
        };

        // Si el centro ya es oscuro, no estamos dentro del recuadro blanco de una casilla vacía
        if (getCanvasBrightness(Math.round(cx), Math.round(cy)) < 200) {
            return null;
        }

        // Buscar borde izquierdo (primer pixel oscuro)
        let leftX = Math.round(cx);
        while (leftX > startX && getCanvasBrightness(leftX, Math.round(cy)) > 170) {
            leftX--;
        }
        
        // Buscar borde derecho
        let rightX = Math.round(cx);
        while (rightX < startX + boxSize - 1 && getCanvasBrightness(rightX, Math.round(cy)) > 170) {
            rightX++;
        }

        // Buscar borde superior
        let topY = Math.round(cy);
        while (topY > startY && getCanvasBrightness(Math.round(cx), topY) > 170) {
            topY--;
        }

        // Buscar borde inferior
        let bottomY = Math.round(cy);
        while (bottomY < startY + boxSize - 1 && getCanvasBrightness(Math.round(cx), bottomY) > 170) {
            bottomY++;
        }

        const w = rightX - leftX;
        const h = bottomY - topY;

        // Restricción: Exigir que los bordes oscuros de la casilla sean realmente visibles e impresos en el PDF
        const foundLeft = leftX > startX;
        const foundRight = rightX < startX + boxSize - 1;
        const foundTop = topY > startY;
        const foundBottom = bottomY < startY + boxSize - 1;

        if (!foundLeft || !foundRight || !foundTop || !foundBottom) {
            return null; // Omitir si no es un recuadro cerrado con bordes impresos reales
        }

        // Restricción: Exigir que sea razonablemente cuadrada (relación de aspecto)
        const aspectRatio = w / h;
        if (aspectRatio < 0.75 || aspectRatio > 1.35) {
            return null;
        }

        // Validar que las dimensiones detectadas correspondan a una casilla razonable (ej. entre 8 y 25px)
        if (w >= 8 && w <= 25 && h >= 8 && h <= 25) {
            const canvas = document.getElementById('pdf-canvas');
            // Utilizar el tamaño inline unificado de pdf-viewport (unscaled layout px)
            // para evitar cualquier deriva de clientWidth/getBoundingClientRect por escalado de CSS.
            const viewportEl = document.getElementById('pdf-viewport');
            const unscaledWidth = parseFloat(viewportEl?.style.width) || canvas.width;
            const unscaledHeight = parseFloat(viewportEl?.style.height) || canvas.height;
            const scaleX = unscaledWidth / canvas.width;
            const scaleY = unscaledHeight / canvas.height;

            return {
                x: leftX * scaleX,
                y: topY * scaleY,
                width: w * scaleX,
                height: h * scaleY
            };
        }
        return null;
    };

    const showPotentialCheckboxes = () => {
        clearPotentialCheckboxes();

        if (activeTool !== 'casilla') return;

        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let fullImgData;
        try {
            fullImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch(e) {
            console.warn('[CasillaScanner] No se pudo leer la imagen del Canvas:', e);
            return;
        }

        const candidates = [];
        const step = 8; // Muestreo de 8px ultra-preciso (evita el aliasing de cuadrícula)
        const cw = canvas.width;
        const ch = canvas.height;

        // Escanear en cuadrícula sobre los bytes del Canvas
        for (let y = 15; y < ch - 15; y += step) {
            for (let x = 15; x < cw - 15; x += step) {
                const bounds = detectCheckboxBoundsFromFullData(fullImgData, cw, ch, x, y);
                if (bounds) {
                    candidates.push(bounds);
                }
            }
        }

        // Filtrado premium de solapamientos: ordenar por área de forma ascendente
        candidates.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const filtered = [];
        for (const cand of candidates) {
            const candArea = cand.width * cand.height;
            const candCenterX = cand.x + cand.width / 2;
            const candCenterY = cand.y + cand.height / 2;

            const isOverlapping = filtered.some(accepted => {
                // Calcular intersección
                const x1 = Math.max(cand.x, accepted.x);
                const y1 = Math.max(cand.y, accepted.y);
                const x2 = Math.min(cand.x + cand.width, accepted.x + accepted.width);
                const y2 = Math.min(cand.y + cand.height, accepted.y + accepted.height);

                const interW = Math.max(0, x2 - x1);
                const interH = Math.max(0, y2 - y1);
                const interArea = interW * interH;

                if (interArea <= 0) return false;

                const acceptedArea = accepted.width * accepted.height;
                const minArea = Math.min(candArea, acceptedArea);
                
                // Si se solapan más del 50% de la casilla menor, descartar la mayor
                if (interArea / minArea > 0.5) {
                    return true;
                }

                // O si sus centros están extremadamente cerca
                const acceptedCenterX = accepted.x + accepted.width / 2;
                const acceptedCenterY = accepted.y + accepted.height / 2;
                const dist = Math.sqrt((candCenterX - acceptedCenterX) ** 2 + (candCenterY - acceptedCenterY) ** 2);
                if (dist < 14) {
                    return true;
                }

                return false;
            });

            if (!isOverlapping) {
                filtered.push(cand);
            }
        }

        const detected = filtered;

        const activePageNum = window.pdfPageNum || 1;
        const pageCheckboxes = checkboxes.filter(cb => Number(cb.pageNum || 1) === Number(activePageNum));

        detected.forEach(bounds => {
            const centerX = bounds.x + bounds.width / 2;
            const centerY = bounds.y + bounds.height / 2;

            // Comprobar si ya existe una casilla del usuario colocada aquí
            const existingCb = pageCheckboxes.find(cb => {
                const cbCenterX = cb.x + cb.width / 2;
                const cbCenterY = cb.y + cb.height / 2;
                const dist = Math.sqrt((centerX - cbCenterX) ** 2 + (centerY - cbCenterY) ** 2);
                return dist < 14;
            });

            // Si ya hay una casilla y tiene un símbolo puesto, no dibujamos la guía predictiva
            if (existingCb && existingCb.symbol !== 'none') {
                return;
            }

            // Crear el overlay verde esmeralda con animación de pulso
            const ph = document.createElement('div');
            ph.className = 'potential-checkbox-placeholder';
            ph.style.left = `${bounds.x}px`;
            ph.style.top = `${bounds.y}px`;
            ph.style.width = `${bounds.width}px`;
            ph.style.height = `${bounds.height}px`;
            ph.title = 'Haz clic para rellenar esta casilla';

            // Al hacer clic, rellenamos de inmediato con el símbolo activo
            ph.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                if (existingCb) {
                    existingCb.symbol = selectedCasillaSymbol;
                    // Forzar re-renderizado
                    const elCb = document.getElementById(existingCb.id);
                    if (elCb) elCb.remove();
                    drawCheckboxOnOverlay(existingCb);
                    if (window.historyManager) window.historyManager.saveState();
                } else {
                    createCheckboxAtBounds(bounds.x, bounds.y, bounds.width, bounds.height, selectedCasillaSymbol);
                }

                // Refrescar guías de inmediato para enmascarar la que acaba de ser rellenada
                showPotentialCheckboxes();
            });

            overlay.appendChild(ph);
        });
    };

    const clearPotentialCheckboxes = () => {
        document.querySelectorAll('.potential-checkbox-placeholder').forEach(el => el.remove());
    };

    const createCheckboxAtBounds = (x, y, w, h, symbol) => {
        let finalColor = '#0f172a';
        const canvas = document.getElementById('pdf-canvas');
        if (canvas) {
            try {
                // Utilizar el tamaño inline unificado de pdf-viewport (unscaled layout px)
                const viewportEl = document.getElementById('pdf-viewport');
                const unscaledWidth = parseFloat(viewportEl?.style.width) || canvas.width;
                const unscaledHeight = parseFloat(viewportEl?.style.height) || canvas.height;
                const scaleX = canvas.width / unscaledWidth;
                const scaleY = canvas.height / unscaledHeight;
                const cx = (x + w / 2) * scaleX;
                const cy = (y + h / 2) * scaleY;
                const ctx = canvas.getContext('2d');
                const pixel = ctx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
                const r = pixel[0];
                const g = pixel[1];
                const b = pixel[2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                finalColor = luminance > 130 ? '#0f172a' : '#ffffff';
            } catch(e){}
        }

        // Evitar duplicados si ya existe una casilla cerca de esta posición
        const activePageNum = window.pdfPageNum || 1;
        const pageCheckboxes = checkboxes.filter(cb => Number(cb.pageNum || 1) === Number(activePageNum));
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const existing = pageCheckboxes.find(cb => {
            const cbCenterX = cb.x + cb.width / 2;
            const cbCenterY = cb.y + cb.height / 2;
            const dist = Math.sqrt((centerX - cbCenterX) ** 2 + (centerY - cbCenterY) ** 2);
            return dist < 14;
        });

        if (existing) {
            console.log('[CasillaAtBounds] Ya existe una casilla en esta posición. Omitiendo duplicado.');
            if (symbol !== 'none') {
                existing.symbol = symbol;
                const elCb = document.getElementById(existing.id);
                if (elCb) {
                    const symbolDiv = elCb.querySelector('.checkbox-symbol');
                    if (symbolDiv) {
                        updateCheckboxSymbolDOM(symbolDiv, existing);
                        updateCheckboxContrast(existing, symbolDiv);
                    }
                }
                if (window.historyManager) window.historyManager.saveState();
            }
            return;
        }

        let bx = x;
        let by = y;
        let bw = w;
        let bh = h;
        
        const overlay = document.getElementById('pdf-overlay');
        if (overlay) {
            const maxW = overlay.clientWidth;
            const maxH = overlay.clientHeight;
            
            bw = Math.min(bw, maxW);
            bh = Math.min(bh, maxH);
            
            if (bx + bw > maxW) bx = maxW - bw;
            if (bx < 0) bx = 0;
            
            if (by + bh > maxH) by = maxH - bh;
            if (by < 0) by = 0;
        }

        const cbData = {
            id: `checkbox_${Date.now()}`,
            x: bx,
            y: by,
            width: bw,
            height: bh,
            symbol: symbol,
            color: finalColor,
            pageNum: window.pdfPageNum || 1
        };

        checkboxes.push(cbData);
        drawCheckboxOnOverlay(cbData);

        if (window.historyManager) window.historyManager.saveState();

        // Enfoque visual
        const el = document.getElementById(cbData.id);
        if (el) {
            document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(w => w.classList.remove('active-focus'));
            el.classList.add('active-focus');
        }
    };

    const scanCanvasForPrintedCheckboxes = (canvas) => {
        if (!canvas) return false;
        const step = 25; // Escaneo rápido de presencia
        const width = canvas.width;
        const height = canvas.height;
        
        for (let y = 40; y < height - 40; y += step) {
            for (let x = 40; x < width - 40; x += step) {
                const bounds = detectCheckboxBounds(canvas, x, y);
                if (bounds) {
                    return true; // Presencia confirmada
                }
            }
        }
        return false;
    };

    const checkDocumentForCheckboxes = async () => {
        console.log('[CasillaScanner] Iniciando escaneo dinámico de casillas...');
        
        // 1. Escaneo digital por metadatos (AcroForm annotations / form elements)
        if (window.pdfInstance) {
            try {
                const maxPagesToCheck = Math.min(3, window.pdfInstance.numPages);
                for (let i = 1; i <= maxPagesToCheck; i++) {
                    const page = await window.pdfInstance.getPage(i);
                    const annotations = await page.getAnnotations();
                    const hasDigital = annotations.some(ann => 
                        ann.subtype === 'Widget' && 
                        (ann.fieldType === 'Btn' || ann.fieldValue === 'true' || ann.fieldValue === 'false')
                    );
                    if (hasDigital) {
                        return true;
                    }
                }
            } catch (e) {
                console.warn('[CasillaScanner] Error al buscar anotaciones:', e);
            }
        }

        // 2. Escaneo visual en el Canvas
        const canvas = document.getElementById('pdf-canvas');
        if (canvas) {
            const hasPrinted = scanCanvasForPrintedCheckboxes(canvas);
            if (hasPrinted) {
                return true;
            }
        }
        return false;
    };

    // --- DETECCIÓN DE FUENTES CUENTAGOTAS ---
    const detectFontAtCoordinates = async (pageNum, clickX, clickY) => {
        if (!window.pdfInstance) return null;
        try {
            const page = await window.pdfInstance.getPage(pageNum);
            const originalViewport = page.getViewport({ scale: 1.0 });
            const pageHeight = originalViewport.height;
            
            // clickX and clickY are screen/overlay coordinates scaled by window.pdfScale
            const x_pdf = clickX / window.pdfScale;
            const y_pdf = pageHeight - (clickY / window.pdfScale);
            
            const textContent = await page.getTextContent();
            
            let closestItem = null;
            let minDistance = Infinity;
            
            for (const item of textContent.items) {
                if (!item.str || item.str.trim() === '') continue;
                
                const x1 = item.transform[4];
                const y1 = item.transform[5];
                const fontSize = Math.abs(item.transform[3]);
                const fontHeight = item.height || fontSize;
                const x2 = x1 + item.width;
                const y2 = y1 + fontHeight;
                
                // Bounding box expandida para capturar el click cómodamente
                const pad = 15;
                const inX = (x_pdf >= x1 - pad) && (x_pdf <= x2 + pad);
                const inY = (y_pdf >= y1 - pad) && (y_pdf <= y2 + pad);
                
                if (inX && inY) {
                    const centerX = (x1 + x2) / 2;
                    const dist = Math.sqrt(Math.pow(x_pdf - centerX, 2) + Math.pow(y_pdf - y1, 2));
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestItem = item;
                    }
                }
            }
            
            if (closestItem) {
                let rawFontName = closestItem.fontName;
                let fontObjName = '';
                const fontObj = page.commonObjs.get(rawFontName);
                if (fontObj && fontObj.name) {
                    fontObjName = fontObj.name;
                } else {
                    fontObjName = rawFontName;
                }
                
                // Limpiar prefijo y estilos de subfuente
                let clean = fontObjName.split('+').pop();
                clean = clean.split(',')[0];
                clean = clean.split('-')[0];
                clean = clean.replace(/-/g, ' ');
                clean = clean.trim();
                clean = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                
                const fontSize = Math.round(Math.abs(closestItem.transform[3]));
                
                return {
                    fontName: clean,
                    fontSize: fontSize,
                    textSnippet: closestItem.str
                };
            }
        } catch (err) {
            console.error('Error al detectar tipografía en coordenadas:', err);
        }
        return null;
    };

    const mapFontToSupported = (name) => {
        if (!name) return null;
        const n = name.toLowerCase();
        if (n.includes('calibri')) return 'Calibri';
        if (n.includes('verdana')) return 'Verdana';
        if (n.includes('arial')) return 'Arial';
        if (n.includes('helvetica') || n.includes('sans')) return 'Helvetica';
        if (n.includes('times') || n.includes('roman') || n.includes('serif') || n.includes('georgia')) return 'Times New Roman';
        if (n.includes('courier') || n.includes('mono') || n.includes('consolas')) return 'Courier New';
        if (n.includes('quicksand')) return 'Quicksand';
        if (n.includes('inter')) return 'Inter';
        return null;
    };

    // ESCANEAR CAMPOS DEL PDF Y EXTRAER FORMATOS EXISTENTES DE LETRA Y FONDO
    const populateTextSettingsFromFields = () => {
        if (!window.pdfFields || window.pdfFields.length === 0) return;

        console.log('Populando dinámicamente opciones de formato desde los campos del PDF...');

        // 1. Extraer fuentes, tamaños y colores únicos y sus frecuencias
        const uniqueFonts = new Set();
        const uniqueSizes = new Set();
        const uniqueColors = new Set();
        const uniqueBgs = new Set(['light', 'dark', 'gray']);

        const fontFreq = {};
        const sizeFreq = {};
        const colorFreq = {};

        window.pdfFields.forEach(field => {
            if (field.isStamp) return; // Omitir stamps para solo reflejar estilos originales

            if (field.fontName) {
                const name = field.fontName.toLowerCase();
                let family = 'Inter, Helvetica, Arial, sans-serif';
                let label = 'Inter / Helvetica';
                if (name.includes('times') || name.includes('serif')) {
                    family = 'Georgia, "Times New Roman", serif';
                    label = 'Georgia / Serif';
                } else if (name.includes('courier') || name.includes('mono')) {
                    family = '"Courier New", Courier, monospace';
                    label = 'Courier / Mono';
                }
                uniqueFonts.add(JSON.stringify({ value: family, label: label }));
                fontFreq[family] = (fontFreq[family] || 0) + 1;
            }
            if (field.fontSize) {
                uniqueSizes.add(field.fontSize);
                sizeFreq[field.fontSize] = (sizeFreq[field.fontSize] || 0) + 1;
            }
            const c = field.color || '#0f172a';
            uniqueColors.add(c);
            colorFreq[c] = (colorFreq[c] || 0) + 1;
            
            if (field.sectionKey === 'cabecera') {
                uniqueBgs.add('dark');
            } else if (field.sectionKey === 'tabla' && (field.text === 'DESCRIPCIÓN' || field.text === 'CANTIDAD' || field.text === 'PRECIO UNIT.' || field.text === 'TOTAL')) {
                uniqueBgs.add('gray');
            } else {
                uniqueBgs.add('light');
            }
        });

        // Encontrar los valores más repetidos (Modas)
        const getMode = (freqMap, defaultVal) => {
            let maxCount = 0;
            let modeVal = defaultVal;
            Object.keys(freqMap).forEach(key => {
                if (freqMap[key] > maxCount) {
                    maxCount = freqMap[key];
                    modeVal = key;
                }
            });
            return modeVal;
        };

        const modeFont = getMode(fontFreq, 'Inter, Helvetica, Arial, sans-serif');
        const modeSize = getMode(sizeFreq, '10');
        const modeColor = getMode(colorFreq, '#0f172a');

        console.log(`[FormatoPorDefecto] Moda detectada -> Fuente: ${modeFont}, Tamaño: ${modeSize}px, Color: ${modeColor}`);

        // Poblar Selector de Fuentes
        const fontSelect = document.getElementById('text-font-select');
        if (fontSelect) {
            fontSelect.innerHTML = '';
            const fontsList = [
                { value: 'Calibri', label: 'Calibri' },
                { value: 'Verdana', label: 'Verdana' },
                { value: 'Arial', label: 'Arial' },
                { value: 'Helvetica', label: 'Helvetica' },
                { value: 'Times New Roman', label: 'Times New Roman' },
                { value: 'Courier New', label: 'Courier New' },
                { value: 'Quicksand', label: 'Quicksand' },
                { value: 'Inter', label: 'Inter' }
            ];
            fontsList.forEach(font => {
                const opt = document.createElement('option');
                opt.value = font.value;
                opt.textContent = font.label;
                opt.style.fontFamily = font.value === 'Courier New' ? 'monospace' : (font.value === 'Times New Roman' ? 'serif' : 'sans-serif');
                fontSelect.appendChild(opt);
            });
            
            const mappedModeFont = mapFontToSupported(modeFont) || 'Inter';
            fontSelect.value = mappedModeFont;
        }

        // Poblar Selector de Tamaños
        const sizeSelect = document.getElementById('text-size-select');
        if (sizeSelect) {
            sizeSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = 'Auto (Detectar)';
            sizeSelect.appendChild(autoOpt);

            const sortedSizes = Array.from(uniqueSizes).sort((a, b) => a - b);
            sortedSizes.forEach(size => {
                const opt = document.createElement('option');
                opt.value = size;
                opt.textContent = `${size} px`;
                sizeSelect.appendChild(opt);
            });
            sizeSelect.value = modeSize; // Por defecto el tamaño que más se repite
        }

        // Poblar Selector de Colores
        const colorSelect = document.getElementById('text-color-select');
        if (colorSelect) {
            colorSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = 'Auto (Detectar)';
            colorSelect.appendChild(autoOpt);

            uniqueColors.add('#0f172a');
            uniqueColors.add('#2563eb');
            uniqueColors.add('#ef4444');
            uniqueColors.add('#ffffff');

            const colorNames = {
                '#0f172a': 'Slate Oscuro',
                '#2563eb': 'Azul Cobalto',
                '#ef4444': 'Rojo Coral',
                '#ffffff': 'Blanco Puro'
            };

            Array.from(uniqueColors).forEach(color => {
                const opt = document.createElement('option');
                opt.value = color;
                opt.textContent = colorNames[color] || `Tinta (${color})`;
                colorSelect.appendChild(opt);
            });
            colorSelect.value = modeColor; // Por defecto el color que más se repite
        }

        // Poblar Selector de Fondos
        const bgSelect = document.getElementById('text-bg-select');
        if (bgSelect) {
            bgSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = 'Auto (Detectar)';
            bgSelect.appendChild(autoOpt);

            const bgNames = {
                'light': 'Caja Clara / Blanca',
                'dark': 'Caja Oscura / Slate',
                'gray': 'Caja Gris / Neutral'
            };

            Array.from(uniqueBgs).forEach(bg => {
                const opt = document.createElement('option');
                opt.value = bg;
                opt.textContent = bgNames[bg] || bg;
                bgSelect.appendChild(opt);
            });
            bgSelect.value = 'auto';
        }
    };

    // API pública para exportación e historial
    return {
        getCorrectorPatches: () => correctorPatches,
        getCheckboxes: () => checkboxes,
        setCorrectorPatches: (list) => {
            correctorPatches.length = 0;
            list.forEach(c => correctorPatches.push(c));
        },
        setCheckboxes: (list) => {
            checkboxes.length = 0;
            list.forEach(cb => checkboxes.push(cb));
            cleanDuplicateCheckboxes();
        },
        renderPlacedTools: renderPlacedTools,
        checkDocumentForCheckboxes: checkDocumentForCheckboxes,
        showPotentialCheckboxes: showPotentialCheckboxes,
        clearPotentialCheckboxes: clearPotentialCheckboxes,
        getActiveTool: () => activeTool,
        toggleTool: toggleTool,
        populateTextSettingsFromFields: populateTextSettingsFromFields
    };
})();
