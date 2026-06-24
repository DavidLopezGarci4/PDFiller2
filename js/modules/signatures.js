// PDFiller 2 - Signatures Capture & Stamping Module
window.signaturesModule = (() => {
    let savedSignatures = [];
    const placedSignatures = [];

    // Referencias a UI
    const modal = document.getElementById('signature-modal');
    const btnOpenSigModal = document.getElementById('btn-open-signature-pad');
    const btnCloseSigModal = document.getElementById('btn-close-sig-modal');
    const canvas = document.getElementById('signature-canvas');
    const btnClearSig = document.getElementById('btn-clear-sig');
    const btnSaveSig = document.getElementById('btn-save-sig');
    const signaturesList = document.getElementById('signatures-list');
    const overlay = document.getElementById('pdf-overlay');
    const imgUpload = document.getElementById('sig-image-upload');

    // Referencias a UI del Crop Modal (Móvil)
    let cropperInstance = null;
    const cropModal = document.getElementById('sig-crop-modal');
    const cropImg = document.getElementById('sig-crop-image');
    const btnCancelCrop = document.getElementById('btn-cancel-crop');
    const btnConfirmCrop = document.getElementById('btn-confirm-crop');
    const btnCloseCropModal = document.getElementById('btn-close-crop-modal');
    const chkCropRemoveBg = document.getElementById('crop-remove-bg');
    
    const btnCropZoomIn = document.getElementById('btn-crop-zoom-in');
    const btnCropZoomOut = document.getElementById('btn-crop-zoom-out');
    const btnCropRotateLeft = document.getElementById('btn-crop-rotate-left');
    const btnCropRotateRight = document.getElementById('btn-crop-rotate-right');

    // Contexto de Canvas para firma
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    // Tinta seleccionada por defecto
    let activeInkColor = '#0f172a';

    // --- 1. GESTIÓN DE PALETA DE COLORES EN MODAL ---
    document.querySelectorAll('#sig-color-palette .color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sig-color-palette .color-swatch').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeInkColor = btn.getAttribute('data-color');
            ctx.strokeStyle = activeInkColor;
        });
    });

    // --- 2. CARGA INICIAL DESDE LOCALSTORAGE ---
    const loadSavedSignatures = () => {
        const stored = localStorage.getItem('pdfiller_signatures');
        if (stored) {
            savedSignatures = JSON.parse(stored);
        } else {
            savedSignatures = [];
        }
        renderSignaturesList();
    };

    const renderSignaturesList = () => {
        signaturesList.innerHTML = '';
        if (savedSignatures.length === 0) {
            signaturesList.innerHTML = '<div class="no-signatures">No hay firmas guardadas. ¡Crea una nueva o sube una imagen!</div>';
            return;
        }

        savedSignatures.forEach((sigDataUrl, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'signature-thumbnail';
            thumb.setAttribute('data-index', index);
            thumb.draggable = true; // HABILITAR ARRASTRE DINÁMICO HTML5

            const img = document.createElement('img');
            img.src = sigDataUrl;
            img.alt = `Firma ${index + 1}`;
            
            const btnDel = document.createElement('button');
            btnDel.className = 'delete-sig';
            btnDel.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btnDel.addEventListener('click', (e) => {
                e.stopPropagation(); // Evitar estampar al borrar
                deleteSignature(index);
            });

            thumb.appendChild(img);
            thumb.appendChild(btnDel);
            signaturesList.appendChild(thumb);

            // Al hacer clic, se estampa en el centro
            thumb.addEventListener('click', () => {
                stampSignatureOnPdf(sigDataUrl);
            });

            // GESTIÓN DE ARRASTRE DRAG AND DROP DESDE EL CAROUSEL
            thumb.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', sigDataUrl);
                e.dataTransfer.effectAllowed = 'copy';
                thumb.classList.add('dragging');
            });

            thumb.addEventListener('dragend', () => {
                thumb.classList.remove('dragging');
            });
        });
    };

    const deleteSignature = (index) => {
        savedSignatures.splice(index, 1);
        localStorage.setItem('pdfiller_signatures', JSON.stringify(savedSignatures));
        renderSignaturesList();
    };

    // --- GESTIÓN DE DROP EN OVERLAY ---
    overlay.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    overlay.addEventListener('drop', (e) => {
        e.preventDefault();
        const sigDataUrl = e.dataTransfer.getData('text/plain');
        if (sigDataUrl && sigDataUrl.startsWith('data:image')) {
            const rect = overlay.getBoundingClientRect();
            const zoom = window.viewportZoom || 1.0;
            const posX = (e.clientX - rect.left) / zoom;
            const posY = (e.clientY - rect.top) / zoom;
            
            // Colocar centrado bajo el cursor
            stampSignatureOnPdf(sigDataUrl, posX - 70, posY - 30);
        }
    });

    // --- 3. DIBUJO DE TRAZOS EN CANVAS ---
    btnOpenSigModal.addEventListener('click', () => {
        modal.classList.add('active');
        resizeCanvas();
        clearCanvas();
    });

    btnCloseSigModal.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    const resizeCanvas = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        ctx.strokeStyle = activeInkColor;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

    const clearCanvas = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    btnClearSig.addEventListener('click', clearCanvas);

    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        lastX = currentX;
        lastY = currentY;
    });

    canvas.addEventListener('pointerup', (e) => { 
        e.preventDefault();
        isDrawing = false; 
    });

    canvas.addEventListener('pointercancel', () => { 
        isDrawing = false; 
    });

    btnSaveSig.addEventListener('click', () => {
        // Obtener el canvas de firma con fondo transparente
        // (Convertir el lienzo blanco en transparente eliminando el color blanco del canvas)
        const dataUrl = extractTransparencyFromSignatureCanvas();
        
        savedSignatures.push(dataUrl);
        localStorage.setItem('pdfiller_signatures', JSON.stringify(savedSignatures));
        
        renderSignaturesList();
        modal.classList.remove('active');
    });

    // Extraer transparencia del canvas de firma dibujado
    const extractTransparencyFromSignatureCanvas = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        tempCtx.drawImage(canvas, 0, 0);
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            // Si el pixel es blanco puro, lo volvemos 100% transparente
            if (r === 255 && g === 255 && b === 255) {
                data[i+3] = 0;
            }
        }
        
        tempCtx.putImageData(imgData, 0, 0);
        return tempCanvas.toDataURL('image/png');
    };

    // --- 4. CARGA DE IMAGEN (JPG/PNG) CON ALGORITMO PREMIUM DE RECORTE Y ELIMINACIÓN DE FONDO ---
    
    // Inicializar controles interactivos del Cropper
    if (btnCropZoomIn) {
        btnCropZoomIn.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropperInstance) cropperInstance.zoom(0.1);
        });
    }
    if (btnCropZoomOut) {
        btnCropZoomOut.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropperInstance) cropperInstance.zoom(-0.1);
        });
    }
    if (btnCropRotateLeft) {
        btnCropRotateLeft.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropperInstance) cropperInstance.rotate(-90);
        });
    }
    if (btnCropRotateRight) {
        btnCropRotateRight.addEventListener('click', (e) => {
            e.preventDefault();
            if (cropperInstance) cropperInstance.rotate(90);
        });
    }

    const closeCropFlow = () => {
        cropModal.classList.remove('active');
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        if (imgUpload) imgUpload.value = '';
    };

    if (btnCancelCrop) btnCancelCrop.addEventListener('click', (e) => { e.preventDefault(); closeCropFlow(); });
    if (btnCloseCropModal) btnCloseCropModal.addEventListener('click', (e) => { e.preventDefault(); closeCropFlow(); });

    if (btnConfirmCrop) {
        btnConfirmCrop.addEventListener('click', (e) => {
            e.preventDefault();
            if (!cropperInstance) return;

            // Obtener el canvas recortado a alta resolución
            const croppedCanvas = cropperInstance.getCroppedCanvas({
                maxWidth: 2048,
                maxHeight: 2048,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (croppedCanvas) {
                let processedDataUrl;
                if (chkCropRemoveBg && chkCropRemoveBg.checked) {
                    // Procesar usando el algoritmo premium de fondo
                    processedDataUrl = extractSignatureFromImage(croppedCanvas);
                } else {
                    processedDataUrl = croppedCanvas.toDataURL('image/png');
                }

                savedSignatures.push(processedDataUrl);
                localStorage.setItem('pdfiller_signatures', JSON.stringify(savedSignatures));
                renderSignaturesList();
                
                // Cerrar todos los modals de firmas
                closeCropFlow();
                modal.classList.remove('active');
            }
        });
    }

    if (imgUpload) {
        imgUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    // Inicializar Cropper.js
                    if (cropperInstance) {
                        cropperInstance.destroy();
                        cropperInstance = null;
                    }
                    
                    cropModal.classList.add('active');
                    cropImg.onload = () => {
                        cropImg.onload = null; // Prevenir doble disparo
                        setTimeout(() => {
                            cropperInstance = new Cropper(cropImg, {
                                viewMode: 1,
                                dragMode: 'move',
                                autoCropArea: 0.85,
                                restore: false,
                                guides: true,
                                center: true,
                                highlight: false,
                                cropBoxMovable: true,
                                cropBoxResizable: true,
                                toggleDragModeOnDblclick: false,
                                background: true,
                                modal: true
                            });
                        }, 100);
                    };
                    cropImg.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Algoritmo Premium de Aislamiento de Tinta (Anti-Cortes y Anti-Pérdida)
    const extractSignatureFromImage = (imgSource) => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Aumentar el tamaño máximo a 2048px para conservar la resolución y nitidez.
        const maxDim = 2048;
        let w = imgSource.width;
        let h = imgSource.height;
        if (w > maxDim || h > maxDim) {
            if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
            } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
            }
        }
        
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCtx.drawImage(imgSource, 0, 0, w, h);
        
        const imgData = tempCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        
        // 1. Muestrear el color del papel (fondo) en los bordes perimetrales (5% exterior)
        let bgR = 0, bgG = 0, bgB = 0;
        let bgSampleCount = 0;
        
        const marginW = Math.max(1, Math.round(w * 0.05));
        const marginH = Math.max(1, Math.round(h * 0.05));
        const step = Math.max(1, Math.round(w / 60)); // Muestreo denso
        
        // Muestrear filas superior e inferior
        for (let x = 0; x < w; x += step) {
            for (let y = 0; y < marginH; y++) {
                const idx = (y * w + x) * 4;
                bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2];
                bgSampleCount++;
            }
            for (let y = h - marginH; y < h; y++) {
                const idx = (y * w + x) * 4;
                bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2];
                bgSampleCount++;
            }
        }
        // Muestrear columnas izquierda y derecha
        for (let y = marginH; y < h - marginH; y += step) {
            for (let x = 0; x < marginW; x++) {
                const idx = (y * w + x) * 4;
                bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2];
                bgSampleCount++;
            }
            for (let x = w - marginW; x < w; x++) {
                const idx = (y * w + x) * 4;
                bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2];
                bgSampleCount++;
            }
        }
        
        if (bgSampleCount > 0) {
            bgR = Math.round(bgR / bgSampleCount);
            bgG = Math.round(bgG / bgSampleCount);
            bgB = Math.round(bgB / bgSampleCount);
        } else {
            bgR = 255; bgG = 255; bgB = 255;
        }
        
        const bgLuminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
        console.log(`[SignatureProcessor Premium] Papel estimado: RGB(${bgR},${bgG},${bgB}), Lum: ${bgLuminance.toFixed(1)}`);
        
        // 2. Extraer el trazo de tinta utilizando contraste adaptativo y desmezclado de color original
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            
            const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
            // Relación de contraste respecto al papel de fondo
            const contrast = (bgLuminance - l) / Math.max(1, bgLuminance);
            
            let alpha = 0;
            
            if (contrast < 0.03 && dist < 15) {
                // Fondo puro -> transparente
                alpha = 0;
            } else if (contrast >= 0.18) {
                // Tinta 100% saturada
                alpha = 1.0;
            } else {
                // Transición sigmoidal suave
                const ratio = (contrast - 0.03) / 0.15;
                // Exponente de realce gamma 0.85 para rescatar trazos finos
                alpha = Math.pow(ratio, 0.85);
            }
            
            if (alpha <= 0.001) {
                data[i+3] = 0;
            } else {
                // Fórmula de desmezclado (Un-premultiplication) no destructiva
                let strokeR = r;
                let strokeG = g;
                let strokeB = b;
                
                if (alpha < 1.0) {
                    const rawR = (r - (1 - alpha) * bgR) / alpha;
                    const rawG = (g - (1 - alpha) * bgG) / alpha;
                    const rawB = (b - (1 - alpha) * bgB) / alpha;
                    
                    // Suavizado hacia el píxel original en alfas muy bajas para evitar ruido
                    const blendOriginal = Math.max(0, Math.min(1, (0.25 - alpha) / 0.20));
                    
                    strokeR = rawR * (1 - blendOriginal) + r * blendOriginal;
                    strokeG = rawG * (1 - blendOriginal) + g * blendOriginal;
                    strokeB = rawB * (1 - blendOriginal) + b * blendOriginal;
                }
                
                // Clampear valores cromáticos
                data[i] = Math.max(0, Math.min(255, Math.round(strokeR)));
                data[i+1] = Math.max(0, Math.min(255, Math.round(strokeG)));
                data[i+2] = Math.max(0, Math.min(255, Math.round(strokeB)));
                data[i+3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
            }
        }
        
        tempCtx.putImageData(imgData, 0, 0);
        return tempCanvas.toDataURL('image/png');
    };

    // Inyectar el botón redondo flotante de eliminación rápida
    const injectDeleteButton = (wrapper, fieldId) => {
        if (wrapper.querySelector('.btn-delete-element')) return;
        
        const btn = document.createElement('button');
        btn.className = 'btn-delete-element';
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        btn.title = 'Eliminar firma';
        
        const performDelete = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.historyManager) {
                window.historyManager.deleteElement(fieldId);
            }
        };

        btn.addEventListener('click', performDelete);
        btn.addEventListener('pointerdown', performDelete);
        
        wrapper.appendChild(btn);
    };

    // --- 5. DIBUJAR FIRMA COLOCADA EN OVERLAY ---
    const drawSignatureOnOverlay = (sigData) => {
        const wrapper = document.createElement('div');
        wrapper.id = sigData.id;
        wrapper.className = 'draggable-stamp';
        wrapper.style.left = `${sigData.x}px`;
        wrapper.style.top = `${sigData.y}px`;
        wrapper.style.width = `${sigData.width}px`;
        wrapper.style.height = `${sigData.height}px`;

        const img = document.createElement('img');
        img.src = sigData.dataUrl;
        img.style.width = '100%';
        img.style.height = '100%';

        wrapper.appendChild(img);
        
        // Inyectar botón de eliminar
        injectDeleteButton(wrapper, sigData.id);
        
        overlay.appendChild(wrapper);

        let posX = sigData.x;
        let posY = sigData.y;
        let w = sigData.width;
        let h = sigData.height;

        // Selección de la firma al hacer clic (para nudging en desktop)
        wrapper.addEventListener('pointerdown', (e) => {
            document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch').forEach(w => w.classList.remove('active-focus'));
            wrapper.classList.add('active-focus');
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        });

        interact(wrapper)
            .draggable({
                listeners: {
                    start() {
                        wrapper.classList.add('active-focus');
                        // Evitar saltos de posición (stale closure) re-leyendo los valores reales de CSS
                        posX = parseFloat(wrapper.style.left) || sigData.x;
                        posY = parseFloat(wrapper.style.top) || sigData.y;
                    },
                    move(event) {
                        const zoom = window.viewportZoom || 1.0;
                        let nextX = posX + event.dx / zoom;
                        let nextY = posY + event.dy / zoom;
                        
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            const sigW = parseFloat(wrapper.style.width) || sigData.width;
                            const sigH = parseFloat(wrapper.style.height) || sigData.height;
                            
                            nextX = Math.max(0, Math.min(nextX, maxW - sigW));
                            nextY = Math.max(0, Math.min(nextY, maxH - sigH));
                        }
                        
                        posX = nextX;
                        posY = nextY;
                        wrapper.style.left = `${posX}px`;
                        wrapper.style.top = `${posY}px`;
                        
                        sigData.x = posX;
                        sigData.y = posY;
                    },
                    end() {
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            const sigW = parseFloat(wrapper.style.width) || sigData.width;
                            const sigH = parseFloat(wrapper.style.height) || sigData.height;
                            posX = Math.max(0, Math.min(posX, maxW - sigW));
                            posY = Math.max(0, Math.min(posY, maxH - sigH));
                        }
                        wrapper.style.left = `${posX}px`;
                        wrapper.style.top = `${posY}px`;
                        sigData.x = posX;
                        sigData.y = posY;

                        wrapper.classList.remove('active-focus');
                        if (window.historyManager) window.historyManager.saveState();
                    }
                }
            })
            .resizable({
                edges: { right: true, bottom: true, left: true, top: true },
                listeners: {
                    start() {
                        wrapper.classList.add('active-focus');
                        // Evitar saltos leyendo tamaño y posición reales de CSS
                        posX = parseFloat(wrapper.style.left) || sigData.x;
                        posY = parseFloat(wrapper.style.top) || sigData.y;
                        w = parseFloat(wrapper.style.width) || sigData.width;
                        h = parseFloat(wrapper.style.height) || sigData.height;
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

                        wrapper.style.left = `${posX}px`;
                        wrapper.style.top = `${posY}px`;
                        wrapper.style.width = `${w}px`;
                        wrapper.style.height = `${h}px`;

                        sigData.x = posX;
                        sigData.y = posY;
                        sigData.width = w;
                        sigData.height = h;
                    },
                    end() {
                        const overlay = document.getElementById('pdf-overlay');
                        if (overlay) {
                            const maxW = overlay.clientWidth;
                            const maxH = overlay.clientHeight;
                            posX = Math.max(0, Math.min(posX, maxW - w));
                            posY = Math.max(0, Math.min(posY, maxH - h));
                        }
                        wrapper.style.left = `${posX}px`;
                        wrapper.style.top = `${posY}px`;
                        wrapper.style.width = `${w}px`;
                        wrapper.style.height = `${h}px`;

                        sigData.x = posX;
                        sigData.y = posY;
                        sigData.width = w;
                        sigData.height = h;

                        wrapper.classList.remove('active-focus');
                        if (window.historyManager) window.historyManager.saveState();
                    }
                }
            });
    };

    const stampSignatureOnPdf = (sigDataUrl, customX = null, customY = null) => {
        let posX, posY;
        
        if (customX !== null && customY !== null) {
            posX = customX;
            posY = customY;
        } else {
            // Posición centrada en viewport por defecto si fue clicleada (normalizada por zoom)
            const scroller = document.getElementById('pdf-scroller');
            const scrollerRect = scroller.getBoundingClientRect();
            const viewRect = overlay.getBoundingClientRect();
            const zoom = window.viewportZoom || 1.0;
            posX = Math.max(20, ((scrollerRect.left + scroller.clientWidth / 2 - 70) - viewRect.left) / zoom);
            posY = Math.max(20, ((scrollerRect.top + scroller.clientHeight / 2 - 30) - viewRect.top) / zoom);
        }

        if (overlay) {
            const maxW = overlay.clientWidth;
            const maxH = overlay.clientHeight;
            posX = Math.max(0, Math.min(posX, maxW - 140));
            posY = Math.max(0, Math.min(posY, maxH - 60));
        }

        const stampId = `sig_stamp_${Date.now()}`;
        const sigData = {
            id: stampId,
            dataUrl: sigDataUrl,
            x: posX,
            y: posY,
            width: 140,
            height: 60,
            pageNum: window.pdfPageNum || 1
        };

        placedSignatures.push(sigData);
        drawSignatureOnOverlay(sigData);

        if (window.historyManager) window.historyManager.saveState();

        // Foco visual inmediato a la firma recién creada para que se pueda manipular al instante
        setTimeout(() => {
            const el = document.getElementById(stampId);
            if (el) {
                document.querySelectorAll('.editable-field-wrapper, .draggable-stamp, .corrector-patch').forEach(w => w.classList.remove('active-focus'));
                el.classList.add('active-focus');
            }
        }, 120);
    };

    // --- RE-RENDERING GLOBAL TRAS UNDO/REDO ---
    const renderPlacedSignatures = () => {
        placedSignatures.forEach(sig => {
            if (Number(sig.pageNum || 1) === Number(window.pdfPageNum) || sig.pageNum === undefined) {
                drawSignatureOnOverlay(sig);
            }
        });
    };

    // Auto-cargar firmas al iniciar
    loadSavedSignatures();

    // API pública para exportación e historial
    return {
        getPlacedSignatures: () => placedSignatures,
        setPlacedSignatures: (list) => {
            placedSignatures.length = 0;
            list.forEach(s => placedSignatures.push(s));
        },
        renderPlacedSignatures: renderPlacedSignatures
    };
})();
