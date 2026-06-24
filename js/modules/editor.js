// PDFiller 2 - Interactive WYSIWYG Editor & Collision Detection Module
window.editorModule = (() => {
    let activeFields = [];
    let collisions = new Set(); // Registra IDs de campos colisionando

    // Redimensionado dinámico horizontal y vertical premium optimizado para retroceso
    const updateFieldDimensions = (input, wrapper, field) => {
        const text = input.innerText || input.textContent || '';
        
        // Si contiene saltos de línea (Intro), permitimos pre-wrap, si no pre (nowrap horizontal)
        if (text.includes('\n') || text.includes('\r')) {
            input.style.whiteSpace = 'pre-wrap';
        } else {
            input.style.whiteSpace = 'pre';
        }
        
        // Poner temporalmente el wrapper y el input en auto para medir el scrollWidth real libre de restricciones
        const prevW = wrapper.style.width;
        const prevH = wrapper.style.height;
        wrapper.style.width = 'auto';
        wrapper.style.height = 'auto';
        input.style.width = 'auto';
        input.style.height = 'auto';
        
        const measuredWidth = Math.max(input.scrollWidth + 12, 40); // Ancho mínimo de seguridad
        const measuredHeight = Math.max(input.scrollHeight + 4, 18);
        
        field.width = measuredWidth;
        field.height = measuredHeight;
        
        wrapper.style.width = `${measuredWidth}px`;
        wrapper.style.height = `${measuredHeight}px`;
        
        input.style.width = '100%';
        input.style.height = '100%';
    };

    // Throttleador de colisiones para máxima fluidez de movimiento
    let collisionTimeout = null;
    const throttledCollisionDetection = () => {
        if (collisionTimeout) return;
        collisionTimeout = setTimeout(() => {
            runCollisionDetection();
            collisionTimeout = null;
        }, 120); // Ejecutar máximo una vez cada 120ms
    };

    // Inyectar el menú flotante premium de 4 opciones (Formato, Editar, Mover, Eliminar)
    // Inyectar el menú flotante premium de 4 opciones (Formato, Editar, Mover, Eliminar)
    const injectQuickControls = (wrapper, field) => {
        if (wrapper.querySelector('.quick-controls-wrapper')) return;
        
        const controls = document.createElement('div');
        controls.className = 'quick-controls-wrapper';
        
        const input = wrapper.querySelector('.editable-field-input');
        
        // Inicializar estado de bloqueo por defecto
        if (field.locked === undefined) field.locked = true;
        
        // 1. Botón de Formato (Púrpura)
        const formatBtn = document.createElement('button');
        formatBtn.className = 'btn-quick-action';
        formatBtn.style.backgroundColor = '#8a2be2';
        formatBtn.style.color = 'white';
        formatBtn.style.border = '1px solid white';
        formatBtn.style.borderRadius = '50%';
        formatBtn.style.width = '24px';
        formatBtn.style.height = '24px';
        formatBtn.style.fontSize = '10px';
        formatBtn.style.cursor = 'pointer';
        formatBtn.style.display = 'inline-flex';
        formatBtn.style.alignItems = 'center';
        formatBtn.style.justifyContent = 'center';
        formatBtn.innerHTML = '<i class="fa-solid fa-paint-roller"></i>';
        formatBtn.title = 'Formato (Copiar/Pegar)';
        
        formatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (input) {
                // Si ya hay un formato copiado de otro campo, aplicarlo
                if (window.copiedFormat && window.copiedFormat.sourceId !== field.id) {
                    const fmt = window.copiedFormat;
                    field.fontSize = fmt.fontSize;
                    field.fontName = fmt.fontName;
                    if (fmt.color) field.color = fmt.color;
                    
                    input.style.fontSize = `${fmt.fontSize}px`;
                    input.style.color = fmt.color;
                    input.style.fontWeight = fmt.fontWeight;
                    input.style.fontFamily = fmt.fontFamily;
                    
                    // Actualizar clases de fondo
                    wrapper.className = wrapper.className.replace(/\bfield-bg-\S+/g, '') + ' ' + fmt.wrapperBg;
                    
                    // Recalcular dimensiones
                    updateFieldDimensions(input, wrapper, field);
                    
                    // Limpiar copia de formato
                    window.copiedFormat = null;
                    const workspaceScroller = document.getElementById('pdf-scroller');
                    if (workspaceScroller) workspaceScroller.style.cursor = 'default';
                    
                    if (window.historyManager) window.historyManager.saveState();
                    runCollisionDetection();
                    console.log('Formato aplicado al campo:', field.id);
                } else {
                    // Si no, copiar formato actual
                    const style = window.getComputedStyle(input);
                    window.copiedFormat = {
                        sourceId: field.id,
                        fontSize: parseFloat(style.fontSize) || field.fontSize,
                        color: style.color || '#0f172a',
                        fontName: field.fontName || 'Helvetica',
                        fontWeight: style.fontWeight || 'normal',
                        fontFamily: style.fontFamily || 'Inter, sans-serif',
                        wrapperBg: wrapper.className.includes('field-bg-dark') ? 'field-bg-dark' : (wrapper.className.includes('field-bg-gray') ? 'field-bg-gray' : 'field-bg-light'),
                        bgColor: window.getComputedStyle(wrapper).backgroundColor
                    };
                    const workspaceScroller = document.getElementById('pdf-scroller');
                    if (workspaceScroller) workspaceScroller.style.cursor = 'cell';
                    console.log('Formato de texto copiado:', window.copiedFormat);
                }
            }
        });

        // 2. Botón de Editar Texto (Naranja)
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-quick-action';
        editBtn.style.backgroundColor = '#f97316';
        editBtn.style.color = 'white';
        editBtn.style.border = '1px solid white';
        editBtn.style.borderRadius = '50%';
        editBtn.style.width = '24px';
        editBtn.style.height = '24px';
        editBtn.style.fontSize = '10px';
        editBtn.style.cursor = 'pointer';
        editBtn.style.display = 'inline-flex';
        editBtn.style.alignItems = 'center';
        editBtn.style.justifyContent = 'center';
        editBtn.innerHTML = '<i class="fa-solid fa-file-pen"></i>';
        editBtn.title = 'Editar texto';
        
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Bloquear arrastre al editar
            field.locked = true;
            wrapper.classList.remove('dragging-enabled');
            wrapper.classList.add('is-writing');
            
            // Activar foco y edición en el campo
            input.style.pointerEvents = 'auto';
            input.contentEditable = true;
            input.focus();
            
            // Situar el cursor de texto al final
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // 3. Botón de Mover Campo (Azul)
        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn-quick-action';
        moveBtn.style.backgroundColor = '#3b82f6';
        moveBtn.style.color = 'white';
        moveBtn.style.border = '1px solid white';
        moveBtn.style.borderRadius = '50%';
        moveBtn.style.width = '24px';
        moveBtn.style.height = '24px';
        moveBtn.style.fontSize = '10px';
        moveBtn.style.cursor = 'pointer';
        moveBtn.style.display = 'inline-flex';
        moveBtn.style.alignItems = 'center';
        moveBtn.style.justifyContent = 'center';
        moveBtn.innerHTML = '<i class="fa-solid fa-arrows-up-down-left-right"></i>';
        moveBtn.title = 'Mover campo';
        
        moveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Desbloquear arrastre interactivo
            field.locked = false;
            wrapper.classList.add('dragging-enabled');
            wrapper.classList.remove('is-writing');
            
            // Quitar modo de edición para poder arrastrar con suavidad en móviles
            input.style.pointerEvents = 'none';
            input.contentEditable = false;
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        });

        // 4. Botón de Eliminar (Rojo)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-quick-action';
        deleteBtn.style.backgroundColor = '#ef4444';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = '1px solid white';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.fontSize = '10px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.display = 'inline-flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteBtn.title = 'Eliminar campo';
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.historyManager) {
                window.historyManager.deleteElement(field.id);
            }
        });
        
        controls.appendChild(formatBtn);
        controls.appendChild(editBtn);
        controls.appendChild(moveBtn);
        controls.appendChild(deleteBtn);
        wrapper.appendChild(controls);
        
        // Sincronizar clase visual de arrastre si no está bloqueado
        if (!field.locked) {
            wrapper.classList.add('dragging-enabled');
        }
    };

    // Inicializar el overlay de campos
    const initFieldsOverlay = (fields) => {
        activeFields = fields.filter(f => !f.deleted && (Number(f.pageNum || 1) === Number(window.pdfPageNum) || f.pageNum === undefined)); // Filtrar campos eliminados del PDF y de otras páginas
        collisions.clear();
        hideConflictBanner();

        const overlay = document.getElementById('pdf-overlay');
        overlay.innerHTML = ''; // Limpiar previo

        activeFields.forEach(field => {
            // Determinar el estilo de fondo según la sección e importancia
            let fieldBg = 'light';
            let patchColor = '#ffffff';
            
            if (field.sectionKey === 'cabecera') {
                fieldBg = 'dark';
                patchColor = '#1e293b';
            } else if (field.sectionKey === 'tabla' && (field.text === 'DESCRIPCIÓN' || field.text === 'CANTIDAD' || field.text === 'PRECIO UNIT.' || field.text === 'TOTAL')) {
                fieldBg = 'gray';
                patchColor = '#f8fafc';
            }

            // Si es una estampa libre y tiene color blanco, forzar fondo oscuro para contraste
            if (field.isStamp) {
                if (field.color === '#ffffff') {
                    fieldBg = 'dark';
                } else {
                    fieldBg = 'light';
                }
            }

            // 1. Crear el parche corrector estático en las coordenadas originales de inicio (solo si no es una estampa colocada)
            if (!field.isStamp) {
                const patch = document.createElement('div');
                patch.id = `patch_${field.id}`;
                patch.className = 'static-cover-patch';
                patch.style.left = `${field.startX}px`;
                patch.style.top = `${field.startY}px`;
                patch.style.width = `${field.width}px`;
                patch.style.height = `${field.height}px`;
                patch.style.backgroundColor = patchColor;
                overlay.appendChild(patch);
            }

            // 2. Crear la envoltura absoluta del campo interactivo
            const wrapper = document.createElement('div');
            wrapper.id = `wrapper_${field.id}`;
            wrapper.className = `editable-field-wrapper field-bg-${fieldBg}`;
            if (field.isStamp) {
                wrapper.classList.add('is-stamp');
            }
            wrapper.style.left = `${field.x}px`;
            wrapper.style.top = `${field.y}px`;
            wrapper.style.width = `${field.width}px`;
            wrapper.style.height = `${field.height}px`;

            // Crear el input editable real
            const input = document.createElement('div');
            input.id = field.id;
            input.className = 'editable-field-input';
            input.contentEditable = false;
            input.style.pointerEvents = 'none';
            input.textContent = field.text;

            // Aplicar estilos tipográficos originales extraídos del PDF
            input.style.fontSize = `${field.fontSize}px`;
            if (field.color) {
                input.style.color = field.color;
            }
            
            // Mapear fuentes estándar de PDF.js a fuentes web estándar
            const fontNameLower = field.fontName ? field.fontName.toLowerCase() : '';
            if (fontNameLower.includes('bold')) {
                input.style.fontWeight = 'bold';
            } else {
                input.style.fontWeight = 'normal';
            }
            
            if (fontNameLower.includes('calibri')) {
                input.style.fontFamily = 'Calibri, sans-serif';
            } else if (fontNameLower.includes('verdana')) {
                input.style.fontFamily = 'Verdana, sans-serif';
            } else if (fontNameLower.includes('arial')) {
                input.style.fontFamily = 'Arial, sans-serif';
            } else if (fontNameLower.includes('times') || fontNameLower.includes('serif') || fontNameLower.includes('georgia')) {
                input.style.fontFamily = 'Georgia, "Times New Roman", serif';
            } else if (fontNameLower.includes('courier') || fontNameLower.includes('mono')) {
                input.style.fontFamily = '"Courier New", Courier, monospace';
            } else if (fontNameLower.includes('quicksand')) {
                input.style.fontFamily = 'Quicksand, sans-serif';
            } else if (fontNameLower.includes('inter')) {
                input.style.fontFamily = 'Inter, sans-serif';
            } else {
                input.style.fontFamily = 'Inter, Helvetica, Arial, sans-serif';
            }

            wrapper.appendChild(input);
            overlay.appendChild(wrapper);

            // Selección del wrapper al hacer clic (para nudging en desktop) sin enfocar el input de texto
            wrapper.addEventListener('pointerdown', (e) => {
                // Deseleccionar todos los demás wrappers y eliminar sus controles rápidos
                document.querySelectorAll('.editable-field-wrapper').forEach(w => {
                    if (w !== wrapper) {
                        w.classList.remove('active-focus', 'dragging-enabled', 'is-writing');
                        const controls = w.querySelector('.quick-controls-wrapper');
                        if (controls) controls.remove();
                        const inp = w.querySelector('.editable-field-input');
                        if (inp) {
                            inp.contentEditable = false;
                            inp.style.pointerEvents = 'none';
                        }
                    }
                });
                document.querySelectorAll('.draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(w => w.classList.remove('active-focus'));
                
                // Asegurar estado neutral al seleccionar inicialmente (bloqueado para arrastre y escritura)
                field.locked = true;
                wrapper.classList.remove('dragging-enabled', 'is-writing');
                input.contentEditable = false;
                input.style.pointerEvents = 'none';

                wrapper.classList.add('active-focus');
                injectQuickControls(wrapper, field);

                // Sincronizar barra inferior de formato con este campo
                syncToolbarToField(field, wrapper);
                
                // Si el clic fue en el wrapper pero no en el input de texto, quitar el foco del input para permitir nudging directo
                if (e.target !== input) {
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                }
            });

            // BIND DE EVENTOS DE EDICIÓN
            bindEditEvents(input, wrapper, field);
            
            // CONFIGURAR DRAG AND DROP CON INTERACT.JS (AUTOSNAP INTEGRADO)
            setupDraggable(wrapper, field);
        });

        // Configurar interruptor de modo de edición global
        const toggleEdit = document.getElementById('toggle-edit-mode');
        if (toggleEdit) {
            toggleEdit.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.add('edit-mode-active');
                } else {
                    document.body.classList.remove('edit-mode-active');
                }
            });
        }

        // Configurar selección desde el dropdown
        const dropdown = document.getElementById('fields-dropdown');
        if (dropdown) {
            dropdown.addEventListener('change', (e) => {
                const targetId = e.target.value;
                const inputEl = document.getElementById(targetId);
                if (inputEl) {
                    // Hacer scroll suave hasta el elemento
                    inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Remover focos previos y activar el actual
                    document.querySelectorAll('.editable-field-wrapper').forEach(w => w.classList.remove('active-focus'));
                    
                    const wrapperEl = document.getElementById(`wrapper_${targetId}`);
                    if (wrapperEl) {
                        wrapperEl.classList.add('active-focus');
                    }
                    
                    // Poner cursor de texto
                    setTimeout(() => inputEl.focus(), 300);
                }
            });
        }

        // Actualizar HUD de diagnóstico
        const hudWrappers = document.getElementById('hud-wrappers');
        const hudCoords = document.getElementById('hud-coords');
        const wrappersCount = document.querySelectorAll('.editable-field-wrapper').length;
        if (hudWrappers) hudWrappers.textContent = wrappersCount;

        if (fields.length > 0 && hudCoords) {
            const first = fields[0];
            hudCoords.textContent = `X:${Math.round(first.x)} Y:${Math.round(first.y)} [${first.text.substring(0, 8)}...]`;
        } else if (hudCoords) {
            hudCoords.textContent = 'Ninguno';
        }

        // Poblar dinámicamente opciones de formato en la barra de texto Rellenar
        if (window.fillToolsModule && window.fillToolsModule.populateTextSettingsFromFields) {
            window.fillToolsModule.populateTextSettingsFromFields();
        }
    };

    // Auxiliar para sincronizar barra de herramientas con campo seleccionado
    const syncToolbarToField = (field, wrapper) => {
        const fontSelect = document.getElementById('text-font-select');
        const sizeSelect = document.getElementById('text-size-select');
        const colorSelect = document.getElementById('text-color-select');
        const bgSelect = document.getElementById('text-bg-select');

        if (fontSelect) {
            const fontName = (field.fontName || '').toLowerCase();
            if (fontName.includes('times') || fontName.includes('serif')) {
                fontSelect.value = 'Georgia, "Times New Roman", serif';
            } else if (fontName.includes('courier') || fontName.includes('mono')) {
                fontSelect.value = '"Courier New", Courier, monospace';
            } else {
                fontSelect.value = 'Inter, Helvetica, Arial, sans-serif';
            }
        }

        if (sizeSelect) {
            sizeSelect.value = field.fontSize || 'auto';
        }

        if (colorSelect) {
            colorSelect.value = field.color || 'auto';
        }

        if (bgSelect) {
            const bgClass = wrapper.className.includes('field-bg-dark') ? 'dark' : (wrapper.className.includes('field-bg-gray') ? 'gray' : 'light');
            bgSelect.value = bgClass;
        }
    };

    // Registrar eventos para la edición WYSIWYG
    const bindEditEvents = (input, wrapper, field) => {
        let initialText = '';

        input.addEventListener('focus', () => {
            document.querySelectorAll('.editable-field-wrapper').forEach(w => {
                if (w !== wrapper) w.classList.remove('active-focus');
            });
            wrapper.classList.add('active-focus');
            wrapper.classList.add('is-writing');

            // SI COPIAR FORMATO (PAINT ROLLER) ESTÁ ACTIVO, APLICAR EL FORMATO COPIADO INMEDIATAMENTE
            if (window.copiedFormat) {
                const fmt = window.copiedFormat;
                field.fontSize = fmt.fontSize;
                field.fontName = fmt.fontName;
                
                input.style.fontSize = `${fmt.fontSize}px`;
                input.style.color = fmt.color;
                input.style.fontWeight = fmt.fontWeight;
                input.style.fontFamily = fmt.fontFamily;
                
                // Actualizar clases de fondo para que combine perfectamente
                wrapper.className = wrapper.className.replace(/\bfield-bg-\S+/g, '') + ' ' + fmt.wrapperBg;
                
                // Recalcular dimensiones
                updateFieldDimensions(input, wrapper, field);
                
                // Limpiar copia de formato
                window.copiedFormat = null;
                const workspaceScroller = document.getElementById('pdf-scroller');
                if (workspaceScroller) workspaceScroller.style.cursor = 'default';
                
                if (window.historyManager) window.historyManager.saveState();
                runCollisionDetection();
            }

            initialText = input.textContent;

            // Inyectar controles rápidos (basura + rodillo copiar formato)
            injectQuickControls(wrapper, field);
        });

        input.addEventListener('blur', () => {
            // Revertir a no editable y pointer-events none para arrastre/interacción sin interferencia
            input.contentEditable = false;
            input.style.pointerEvents = 'none';
            wrapper.classList.remove('is-writing');

            // Guardar texto editado en el modelo e historial si cambió (no eliminamos controles aquí)
            if (input.textContent !== initialText) {
                field.text = input.textContent;
                if (window.historyManager) {
                    window.historyManager.saveState();
                }
            }
        });

        // Al escribir en caliente, recalculamos dimensiones y revisamos colisiones (throttleado)
        input.addEventListener('input', () => {
            field.text = input.textContent;
            
            // Redimensionado dinámico premium
            updateFieldDimensions(input, wrapper, field);

            // Ejecutar chequeo instantáneo de colisiones (throttleado)
            throttledCollisionDetection();
        });

        // ESCAPE: Desenfocar el campo de texto para guardar y bloquear de nuevo
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.blur();
            }
        });
    };

    // Configurar arrastre táctil con interact.js y guías visuales
    const setupDraggable = (wrapper, field) => {
        let x = 0;
        let y = 0;

        if (typeof interact === 'undefined') {
            console.warn('interact.js no está cargado. Funcionalidad de arrastre desactivada.');
            return;
        }

        interact(wrapper).draggable({
            // Arrastre inmediato libre de retardos
            inertia: true,
            autoScroll: true,
            listeners: {
                start(event) {
                    if (field.locked === undefined) field.locked = true;
                    
                    const isRellenar = document.body.classList.contains('fill-mode-active');
                    const bypassLock = field.isStamp && isRellenar;
                    
                    if (field.locked && !bypassLock) {
                        event.interaction.stop(); // Detener el arrastre de inmediato
                        return;
                    }
                    wrapper.classList.add('active-focus');
                    injectQuickControls(wrapper, field);

                    // Resetear traducción acumulada a 0 ya que consolidamos en left/top en el 'end' previo
                    x = 0;
                    y = 0;
                },
                move(event) {
                    const zoom = window.viewportZoom || 1.0;
                    x += event.dx / zoom;
                    y += event.dy / zoom;

                    // APLICAR MAGNETISMO / SNAPPING CON OTROS CAMPOS (Omitir para stamps/campos libres)
                    let snapX = x;
                    let snapY = y;

                    // Remover guías de alineación viejas
                    removeAlignmentGuides();

                    if (!field.isStamp) {
                        const currentLeft = field.x + x;
                        const currentTop = field.y + y;
                        const threshold = 4; // Rango de magnetismo optimizado (más sutil y menos "pegajoso")

                        activeFields.forEach(other => {
                            if (other.id === field.id) return;

                            // Obtener coordenadas reales actuales del otro elemento (incluyendo su transformación)
                            const otherEl = document.getElementById(`wrapper_${other.id}`);
                            let otherX = other.x;
                            let otherY = other.y;
                            if (otherEl && otherEl.style.transform) {
                                const matches = otherEl.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
                                if (matches) {
                                    otherX += parseFloat(matches[1]);
                                    otherY += parseFloat(matches[2]);
                                }
                            }

                            // Snapping Vertical (Alinear a la izquierda)
                            if (Math.abs(currentLeft - otherX) < threshold) {
                                snapX = otherX - field.x;
                                drawGuideLine(otherX, 'vertical');
                            }

                            // Snapping Horizontal (Alinear al tope superior)
                            if (Math.abs(currentTop - otherY) < threshold) {
                                snapY = otherY - field.y;
                                drawGuideLine(otherY, 'horizontal');
                            }
                        });
                    }

                    x = snapX;
                    y = snapY;

                    // Desplazar el div
                    wrapper.style.transform = `translate(${x}px, ${y}px)`;

                    // Actualizar coordenadas en el modelo para colisiones en caliente (normalizadas por zoom)
                    const rect = wrapper.getBoundingClientRect();
                    const overlayRect = document.getElementById('pdf-overlay').getBoundingClientRect();
                    
                    // Guardar coordenadas relativas actualizadas
                    field.currentX = (rect.left - overlayRect.left) / zoom;
                    field.currentY = (rect.top - overlayRect.top) / zoom;
                    field.currentWidth = rect.width / zoom;
                    field.currentHeight = rect.height / zoom;

                    // Ejecutar chequeo instantáneo de colisiones (throttleado para suavidad)
                    throttledCollisionDetection();
                },
                end(event) {
                    removeAlignmentGuides();
                    
                    // Consolidar coordenadas en el modelo físico original al soltar
                    const transform = wrapper.style.transform;
                    if (transform) {
                        const matches = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
                        if (matches) {
                            const tx = parseFloat(matches[1]);
                            const ty = parseFloat(matches[2]);
                            
                            // Guardar coordenadas absolutas definitivas en el modelo original
                            field.x += tx;
                            field.y += ty;
                            
                            // Resetear transformación y aplicar left/top fijos para simplificar lógica posterior
                            wrapper.style.transform = 'none';
                            wrapper.style.left = `${field.x}px`;
                            wrapper.style.top = `${field.y}px`;
                        }
                    }
                    
                    // Limpiar campos auxiliares de arrastre
                    delete field.currentX;
                    delete field.currentY;
                    delete field.currentWidth;
                    delete field.currentHeight;
                    
                    // Guardar en el historial tras terminar movimiento
                    if (window.historyManager) {
                        window.historyManager.saveState();
                    }
                    
                    runCollisionDetection(); // Chequeo final exacto sin retardo
                }
            }
        });
    };

    // --- ALGORITMO DETECTOR DE SOLAPAMIENTO / COLISIONES (AABB) ---
    const runCollisionDetection = () => {
        collisions.clear();
        
        // Quitar estilos de colisión previos de todos los elementos
        document.querySelectorAll('.editable-field-wrapper').forEach(w => {
            w.classList.remove('in-conflict');
            // Borrar bombilla anterior
            const bulb = w.querySelector('.conflict-bulb');
            if (bulb) bulb.remove();
        });

        // Comparación cruzada de todos los elementos (Fuerza Bruta O(N^2) sobre campos activos, N es pequeño)
        for (let i = 0; i < activeFields.length; i++) {
            const f1 = activeFields[i];
            if (f1.isStamp) continue; // EXCLUIR STAMPS DE LAS COLISIONES CON OTROS
            
            // Obtener dimensiones reales del primer campo
            const r1 = getFieldBoundingRect(f1);

            for (let j = i + 1; j < activeFields.length; j++) {
                const f2 = activeFields[j];
                if (f2.isStamp) continue; // EXCLUIR STAMPS DE LAS COLISIONES CON OTROS
                
                // Obtener dimensiones reales del segundo campo
                const r2 = getFieldBoundingRect(f2);

                // Algoritmo AABB de colisión 2D con umbral del 35%
                const left = Math.max(r1.x, r2.x);
                const right = Math.min(r1.x + r1.w, r2.x + r2.w);
                const top = Math.max(r1.y, r2.y);
                const bottom = Math.min(r1.y + r1.h, r2.y + r2.h);

                if (right > left && bottom > top) {
                    const overlapW = right - left;
                    const overlapH = bottom - top;

                    const minW = Math.min(r1.w, r2.w);
                    const minH = Math.min(r1.h, r2.h);

                    // Considerar colisión real solo si el solapamiento penetra más del 35% del tamaño vertical y horizontal del campo más pequeño
                    // Con un mínimo absoluto de 8px de intersección para evitar falsos positivos por cercanía visual responsiva.
                    const thresholdW = Math.max(8, minW * 0.35);
                    const thresholdH = Math.max(8, minH * 0.35);

                    if (overlapW >= thresholdW && overlapH >= thresholdH) {
                        // ¡COLISIÓN DETECTADA! Guardar IDs en conflicto
                        collisions.add(f1.id);
                        collisions.add(f2.id);

                        // Aplicar estilos visuales de conflicto
                        const w1 = document.getElementById(`wrapper_${f1.id}`);
                        const w2 = document.getElementById(`wrapper_${f2.id}`);
                        
                        if (w1) w1.classList.add('in-conflict');
                        if (w2) w2.classList.add('in-conflict');

                        // Añadir la bombilla interactiva 💡 al campo enfocado o infractor (el primero)
                        injectBulbIndicator(w1);
                        injectBulbIndicator(w2);

                        // Desplegar el banner superior de conflicto instantáneo
                        showConflictBanner(`⚠️ Conflicto visual: Los campos se solapan o pisan entre sí.`);
                    }
                }
            }
        }

        // Si no quedan colisiones, ocultar el banner superior
        if (collisions.size === 0) {
            hideConflictBanner();
        }
    };

    // Obtener las coordenadas físicas activas de un campo en píxeles del overlay
    const getFieldBoundingRect = (field) => {
        const w = document.getElementById(`wrapper_${field.id}`);
        if (!w) {
            return { x: field.x, y: field.y, w: field.width, h: field.height };
        }
        
        // Si está en arrastre, usamos sus datos temporales, sino leemos left/top actuales del CSS
        const x = field.currentX !== undefined ? field.currentX : parseFloat(w.style.left);
        const y = field.currentY !== undefined ? field.currentY : parseFloat(w.style.top);
        const width = field.currentWidth !== undefined ? field.currentWidth : parseFloat(w.style.width);
        const height = field.currentHeight !== undefined ? field.currentHeight : parseFloat(w.style.height);

        return { x: x, y: y, w: width, h: height };
    };

    // Inyectar el emoticono de la bombilla 💡 en la caja
    const injectBulbIndicator = (wrapperEl) => {
        if (!wrapperEl || wrapperEl.querySelector('.conflict-bulb')) return;

        const bulb = document.createElement('div');
        bulb.className = 'conflict-bulb';
        bulb.innerHTML = '💡';
        bulb.title = 'Este campo excede el tamaño límite e interfiere con la limpieza visual del diseño.';
        
        wrapperEl.appendChild(bulb);
    };

    // Gestión del Banner Superior en Caliente
    const showConflictBanner = (message) => {
        const banner = document.getElementById('conflict-banner');
        const text = document.getElementById('conflict-message');
        if (banner && text) {
            text.textContent = message;
            banner.classList.remove('hidden-banner');
        }
    };

    const hideConflictBanner = () => {
        const banner = document.getElementById('conflict-banner');
        if (banner) {
            banner.classList.add('hidden-banner');
        }
    };

    // Dibujar guías de alineación temporales
    const drawGuideLine = (coord, orientation) => {
        const overlay = document.getElementById('pdf-overlay');
        const guide = document.createElement('div');
        guide.className = 'alignment-guide-line';
        
        if (orientation === 'vertical') {
            guide.style.position = 'absolute';
            guide.style.top = '0';
            guide.style.bottom = '0';
            guide.style.left = `${coord}px`;
            guide.style.width = '1px';
            guide.style.borderLeft = '1px dashed #6366f1';
            guide.style.zIndex = '5';
        } else {
            guide.style.position = 'absolute';
            guide.style.left = '0';
            guide.style.right = '0';
            guide.style.top = `${coord}px`;
            guide.style.height = '1px';
            guide.style.borderTop = '1px dashed #6366f1';
            guide.style.zIndex = '5';
        }
        
        guide.classList.add('temp-guide');
        overlay.appendChild(guide);
    };

    const removeAlignmentGuides = () => {
        document.querySelectorAll('.temp-guide').forEach(g => g.remove());
    };

    const clearAllSelections = () => {
        console.log('[Editor] Limpiando todas las selecciones...');
        document.querySelectorAll('.editable-field-wrapper').forEach(w => {
            w.classList.remove('active-focus', 'dragging-enabled', 'is-writing');
            const input = w.querySelector('.editable-field-input');
            if (input) {
                input.contentEditable = false;
                input.style.pointerEvents = 'none';
            }
            const controls = w.querySelector('.quick-controls-wrapper');
            if (controls) controls.remove();
        });
        
        document.querySelectorAll('.draggable-stamp, .corrector-patch, .draggable-checkbox-wrapper').forEach(w => {
            w.classList.remove('active-focus');
        });
        
        // Bloquear todos los campos en el modelo
        if (window.pdfFields) {
            window.pdfFields.forEach(f => {
                f.locked = true; // Volver a bloquear por defecto
            });
        }
        
        if (window.historyManager) {
            window.historyManager.saveState();
        }
    };

    // Sincronizar selectores de formato inferiores con el campo seleccionado
    const setupBottomSelectorsSync = () => {
        const fontSelect = document.getElementById('text-font-select');
        const sizeSelect = document.getElementById('text-size-select');
        const colorSelect = document.getElementById('text-color-select');
        const bgSelect = document.getElementById('text-bg-select');

        const updateActiveFieldFromToolbar = () => {
            const activeWrapper = document.querySelector('.editable-field-wrapper.active-focus');
            if (!activeWrapper) return;

            const input = activeWrapper.querySelector('.editable-field-input');
            if (!input) return;

            const fieldId = input.id;
            const field = window.pdfFields.find(f => f.id === fieldId);
            if (!field) return;

            // 1. Aplicar Fuente
            if (fontSelect) {
                const val = fontSelect.value;
                input.style.fontFamily = val;
                if (val.includes('Georgia') || val === 'Times New Roman') {
                    field.fontName = 'Times-Roman';
                    input.style.fontWeight = 'normal';
                } else if (val.includes('Courier') || val === 'Courier New') {
                    field.fontName = 'Courier';
                    input.style.fontWeight = 'normal';
                } else if (val === 'Calibri' || val === 'Verdana' || val === 'Arial' || val === 'Helvetica' || val === 'Quicksand' || val === 'Inter') {
                    field.fontName = val;
                    input.style.fontWeight = 'normal';
                } else {
                    field.fontName = 'Helvetica';
                    input.style.fontWeight = 'normal';
                }
            }

            // 2. Aplicar Tamaño
            if (sizeSelect && sizeSelect.value !== 'auto') {
                const sizeVal = parseInt(sizeSelect.value);
                field.fontSize = sizeVal;
                input.style.fontSize = `${sizeVal}px`;
            }

            // 3. Aplicar Color
            if (colorSelect && colorSelect.value !== 'auto') {
                const colorVal = colorSelect.value;
                field.color = colorVal;
                input.style.color = colorVal;
            }

            // 4. Aplicar Fondo
            if (bgSelect && bgSelect.value !== 'auto') {
                const bgVal = bgSelect.value;
                activeWrapper.classList.remove('field-bg-light', 'field-bg-dark', 'field-bg-gray');
                activeWrapper.classList.add(`field-bg-${bgVal}`);
                field.sectionKey = bgVal === 'dark' ? 'cabecera' : (bgVal === 'gray' ? 'tabla' : 'datos');
            }

            // Recalcular dimensiones y colisiones
            updateFieldDimensions(input, activeWrapper, field);
            runCollisionDetection();

            if (window.historyManager) {
                window.historyManager.saveState();
            }
        };

        [fontSelect, sizeSelect, colorSelect, bgSelect].forEach(sel => {
            if (sel) {
                sel.addEventListener('change', updateActiveFieldFromToolbar);
            }
        });
    };

    // Escuchar clics en el fondo del PDF-overlay para deseleccionar y bloquear todo
    document.addEventListener('DOMContentLoaded', () => {
        const overlay = document.getElementById('pdf-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    clearAllSelections();
                }
            });
        }
        setupBottomSelectorsSync();
    });

    // API pública del módulo
    return {
        initFieldsOverlay: initFieldsOverlay,
        runCollisionDetection: runCollisionDetection,
        clearAllSelections: clearAllSelections,
        hasCollisions: () => collisions.size > 0,
        getCollisions: () => Array.from(collisions).map(id => {
            const f = activeFields.find(field => field.id === id);
            return f ? f.text : id;
        })
    };
})();
