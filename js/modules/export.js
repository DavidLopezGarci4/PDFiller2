// PDFiller 2 - PDF Compilation & Export Module (Using pdf-lib)
window.exportModule = (() => {
    
    // Elementos UI del banner de advertencia de guardado
    const saveWarningBanner = document.getElementById('save-warning-banner');
    const collisionListSummary = document.getElementById('collision-list-summary');
    const btnCancelSave = document.getElementById('btn-cancel-save');
    const btnForceSave = document.getElementById('btn-force-save');

    // Inicializar listeners del banner
    btnCancelSave.addEventListener('click', () => {
        saveWarningBanner.classList.remove('active');
    });

    btnForceSave.addEventListener('click', () => {
        saveWarningBanner.classList.remove('active');
        const filename = window.pendingExportFilename || 'documento_editado.pdf';
        exportModifiedPdf(filename); // Forzar la descarga con el nombre elegido
    });

    // Mostrar el banner de advertencia con la lista de colisiones
    const showWarningBanner = () => {
        if (!window.editorModule) return;
        
        collisionListSummary.innerHTML = '';
        const list = window.editorModule.getCollisions();
        
        list.forEach(itemText => {
            const li = document.createElement('li');
            const trimmed = itemText.length > 35 ? itemText.substring(0, 35) + '...' : itemText;
            li.textContent = `Campo en conflicto: "${trimmed}"`;
            collisionListSummary.appendChild(li);
        });

        saveWarningBanner.classList.add('active');
    };

    const triggerClassicDownload = (bytes, filename) => {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- COMPILACIÓN Y DESCARGA FÍSICA CON PDF-LIB ---
    const exportModifiedPdf = async (customFilename = null) => {
        if (!window.pdfBytes) return;

        console.log('Iniciando compilación física del PDF...');
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.querySelector('p').textContent = 'Generando archivo PDF final...';
        loadingOverlay.classList.add('active');

        try {
            // Cargar los bytes binarios originales del PDF en pdf-lib
            const pdfDoc = await PDFLib.PDFDocument.load(window.pdfBytes);
            
            // Registrar fontkit framework
            pdfDoc.registerFontkit(window.fontkit);

            // Fuente estándar para los nuevos textos
            const helveticaFont = await pdfDoc.embedStandardFont(PDFLib.StandardFonts.Helvetica);
            const helveticaBoldFont = await pdfDoc.embedStandardFont(PDFLib.StandardFonts.HelveticaBold);
            const timesRomanFont = await pdfDoc.embedStandardFont(PDFLib.StandardFonts.TimesRoman);
            const courierFont = await pdfDoc.embedStandardFont(PDFLib.StandardFonts.Courier);

            // Carga asíncrona de fuentes personalizadas con fallbacks seguros
            let calibriFont = null;
            let verdanaFont = null;
            let quicksandFont = null;
            let interFont = null;

            // Carlito TTF (for Calibri)
            try {
                const fontRes = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/carlito/Carlito-Regular.ttf');
                if (fontRes.ok) {
                    const calBytes = await fontRes.arrayBuffer();
                    calibriFont = await pdfDoc.embedFont(calBytes);
                } else {
                    throw new Error('Fetch failed');
                }
            } catch (e) {
                console.warn('Fallo al cargar Calibri (carlito), usando Helvetica fallback', e);
                calibriFont = helveticaFont;
            }

            // DejaVu Sans TTF (for Verdana)
            try {
                const fontRes = await fetch('https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/resources/ttf/DejaVuSans.ttf');
                if (fontRes.ok) {
                    const verBytes = await fontRes.arrayBuffer();
                    verdanaFont = await pdfDoc.embedFont(verBytes);
                } else {
                    throw new Error('Fetch failed');
                }
            } catch (e) {
                console.warn('Fallo al cargar Verdana (DejaVuSans), usando Helvetica fallback', e);
                verdanaFont = helveticaFont;
            }

            // Quicksand TTF
            try {
                const fontRes = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/quicksand/Quicksand-Regular.ttf');
                if (fontRes.ok) {
                    const qBytes = await fontRes.arrayBuffer();
                    quicksandFont = await pdfDoc.embedFont(qBytes);
                } else {
                    throw new Error('Fetch failed');
                }
            } catch (e) {
                console.warn('Fallo al cargar Quicksand, usando Helvetica fallback', e);
                quicksandFont = helveticaFont;
            }

            // Inter TTF
            try {
                const fontRes = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Regular.ttf');
                if (fontRes.ok) {
                    const intBytes = await fontRes.arrayBuffer();
                    interFont = await pdfDoc.embedFont(intBytes);
                } else {
                    throw new Error('Fetch failed');
                }
            } catch (e) {
                console.warn('Fallo al cargar Inter, usando Helvetica fallback', e);
                interFont = helveticaFont;
            }

            const pages = pdfDoc.getPages();

            // --- 1. APLICAR PARCHES CORRECTOR (WHITEOUT) ---
            const correctorPatches = window.fillToolsModule.getCorrectorPatches();
            for (const patch of correctorPatches) {
                const pNum = patch.pageNum || 1;
                const pageIndex = pNum - 1;
                if (pageIndex < 0 || pageIndex >= pages.length) continue;
                const page = pages[pageIndex];
                const pageHeight = page.getHeight();

                // Traducir coordenadas HTML a coordenadas PDF (escala invertida en Y)
                const pdfX = patch.x / window.pdfScale;
                const pdfWidth = patch.width / window.pdfScale;
                const pdfHeight = patch.height / window.pdfScale;
                // PDF.js Y empieza arriba, pdf-lib Y empieza abajo
                const pdfY = pageHeight - ((patch.y + patch.height) / window.pdfScale);

                page.drawRectangle({
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    color: PDFLib.rgb(1, 1, 1), // Blanco puro
                });
            }

            // --- 2. APLICAR TEXTOS MODIFICADOS DE LA CAPA OVERLAY ---
            if (window.pdfFields) {
                for (const field of window.pdfFields) {
                    const pNum = field.pageNum || 1;
                    const pageIndex = pNum - 1;
                    if (pageIndex < 0 || pageIndex >= pages.length) continue;
                    const page = pages[pageIndex];
                    const pageHeight = page.getHeight();

                    const isOriginal = !field.isStamp;
                    const isDeletedOriginal = field.deleted && isOriginal;
                    const originalText = field.originalText !== undefined ? field.originalText : field.text;
                    const startX = field.startX !== undefined ? field.startX : field.x;
                    const startY = field.startY !== undefined ? field.startY : field.y;

                    // Comprobar si el campo original ha sido modificado, movido o eliminado
                    const isOriginalModified = isOriginal && (
                        field.deleted ||
                        field.text !== originalText ||
                        Math.abs(field.x - startX) > 0.5 ||
                        Math.abs(field.y - startY) > 0.5
                    );

                    // Si está eliminado pero no es original (es decir, una estampa de texto borrada), omitir por completo
                    if (field.deleted && field.isStamp) continue;

                    // Obtener elemento HTML visual para leer el texto más actualizado (si existe, está en la página activa y no está eliminado)
                    if (!field.deleted && Number(pNum) === Number(window.pdfPageNum)) {
                        const el = document.getElementById(field.id);
                        if (el) {
                            field.text = el.textContent;
                        }
                    }

                    // Si es un campo original y NO ha sido modificado, lo ignoramos por completo
                    // ya que el PDF original ya lo contiene renderizado de forma nativa.
                    if (isOriginal && !isOriginalModified) continue;

                    // Ignorar si el texto está vacío (y no está siendo eliminado intencionadamente de la factura original)
                    if (!isDeletedOriginal && (!field.text || field.text.trim() === '')) continue;

                    const pdfX = field.x / window.pdfScale;
                    const pdfWidth = field.width / window.pdfScale;
                    const pdfHeight = field.height / window.pdfScale;
                    const pdfY = pageHeight - ((field.y + field.height) / window.pdfScale);
                    const originalFontSizePdf = field.originalFontSize || (field.fontSize / window.pdfScale);

                    // Determinar el color del fondo del parche y del texto según la sección para el PDF final
                    let pdfBgColor = PDFLib.rgb(1, 1, 1); // Blanco por defecto
                    let pdfTextColor = PDFLib.rgb(0.059, 0.09, 0.165); // Gris pizarra muy oscuro (#0f172a)

                    if (field.color) {
                        try {
                            const hex = field.color.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) / 255;
                            const g = parseInt(hex.substring(2, 4), 16) / 255;
                            const b = parseInt(hex.substring(4, 6), 16) / 255;
                            pdfTextColor = PDFLib.rgb(r, g, b);
                        } catch (e) {
                            console.warn('Error al parsear color del campo:', e);
                        }
                    } else if (field.sectionKey === 'cabecera') {
                        pdfBgColor = PDFLib.rgb(0.118, 0.161, 0.231); // Gris pizarra de cabecera (#1e293b)
                        pdfTextColor = PDFLib.rgb(1, 1, 1); // Blanco
                    } else if (field.sectionKey === 'tabla' && (field.text === 'DESCRIPCIÓN' || field.text === 'CANTIDAD' || field.text === 'PRECIO UNIT.' || field.text === 'TOTAL')) {
                        pdfBgColor = PDFLib.rgb(0.973, 0.980, 0.988); // Gris claro de la cabecera de tabla (#f8fafc)
                        pdfTextColor = PDFLib.rgb(0.118, 0.161, 0.231); // Gris pizarra (#1e293b)
                    }

                    if (isOriginalModified) {
                        const pdfCoverX = startX / window.pdfScale;
                        const pdfCoverWidth = field.width / window.pdfScale;
                        const pdfCoverHeight = field.height / window.pdfScale;
                        const pdfCoverY = pageHeight - ((startY + field.height) / window.pdfScale);

                        // Dibujar parche corrector del color correspondiente para limpiar el fondo
                        page.drawRectangle({
                            x: pdfCoverX,
                            y: pdfCoverY,
                            width: pdfCoverWidth + 2,
                            height: pdfCoverHeight,
                            color: pdfBgColor,
                        });
                    }

                    // Si el campo fue marcado como eliminado, no dibujamos el texto (solo pintamos el parche corrector)
                    if (field.deleted) continue;

                    // Determinar fuente en pdf-lib
                    let activeFont = helveticaFont;
                    if (field.fontName === 'Calibri') activeFont = calibriFont || helveticaFont;
                    else if (field.fontName === 'Verdana') activeFont = verdanaFont || helveticaFont;
                    else if (field.fontName === 'Arial' || field.fontName === 'Helvetica') activeFont = helveticaFont;
                    else if (field.fontName === 'Times New Roman' || field.fontName === 'Times-Roman') activeFont = timesRomanFont || helveticaFont;
                    else if (field.fontName === 'Courier New' || field.fontName === 'Courier') activeFont = courierFont || helveticaFont;
                    else if (field.fontName === 'Quicksand') activeFont = quicksandFont || helveticaFont;
                    else if (field.fontName === 'Inter') activeFont = interFont || helveticaFont;
                    else if (field.fontName && field.fontName.toLowerCase().includes('bold')) {
                        activeFont = helveticaBoldFont;
                    }

                    // Dibujar el nuevo texto en las coordenadas corregidas
                    page.drawText(field.text, {
                        x: pdfX + 2, // Ajuste leve de padding
                        y: pdfY + 4,
                        size: originalFontSizePdf,
                        font: activeFont,
                        color: pdfTextColor,
                    });
                }
            }



            // --- 4. APLICAR FIRMAS GUARDADAS Y COLOCADAS (EMBED DE IMAGENES PNG) ---
            const placedSignatures = window.signaturesModule.getPlacedSignatures();
            for (const sig of placedSignatures) {
                const pNum = sig.pageNum || 1;
                const pageIndex = pNum - 1;
                if (pageIndex < 0 || pageIndex >= pages.length) continue;
                const page = pages[pageIndex];
                const pageHeight = page.getHeight();

                const pdfX = sig.x / window.pdfScale;
                const pdfWidth = sig.width / window.pdfScale;
                const pdfHeight = sig.height / window.pdfScale;
                const pdfY = pageHeight - ((sig.y + sig.height) / window.pdfScale);

                // Embed PNG en pdf-lib
                const sigImage = await pdfDoc.embedPng(sig.dataUrl);

                page.drawImage(sigImage, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight
                });
            }

            // --- 4.5. APLICAR CASILLAS DE RELLENO INTELIGENTES (CHECKBOXES) ---
            if (window.fillToolsModule && window.fillToolsModule.getCheckboxes) {
                const checkboxes = window.fillToolsModule.getCheckboxes();
                for (const cb of checkboxes) {
                    if (cb.symbol === 'none') continue; // Omitir si no está rellena

                    const pNum = cb.pageNum || 1;
                    const pageIndex = pNum - 1;
                    if (pageIndex < 0 || pageIndex >= pages.length) continue;
                    const page = pages[pageIndex];
                    const pageHeight = page.getHeight();

                    const pdfX = cb.x / window.pdfScale;
                    const pdfWidth = cb.width / window.pdfScale;
                    const pdfHeight = cb.height / window.pdfScale;
                    const pdfY = pageHeight - ((cb.y + cb.height) / window.pdfScale);

                    // Convertir el color hex de la casilla a pdf-lib RGB
                    let color = PDFLib.rgb(0.059, 0.09, 0.165); // Color gris oscuro por defecto
                    if (cb.color) {
                        try {
                            const hex = cb.color.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) / 255;
                            const g = parseInt(hex.substring(2, 4), 16) / 255;
                            const b = parseInt(hex.substring(4, 6), 16) / 255;
                            color = PDFLib.rgb(r, g, b);
                        } catch (e) {
                            console.warn('Error al parsear color de casilla (usando default):', e);
                        }
                    }

                    // DIBUJAR SÍMBOLOS VECTORIALMENTE PARA EVITAR ERRORES DE CODIFICACIÓN UNICODE
                    if (cb.symbol === 'dot') {
                        // Dibujar un círculo relleno en el centro
                        page.drawCircle({
                            x: pdfX + pdfWidth / 2,
                            y: pdfY + pdfHeight / 2,
                            size: (pdfWidth * 0.5) * 0.6, // Radio proporcional
                            color: color,
                        });
                    } else if (cb.symbol === 'x') {
                        // Dibujar dos diagonales cruzadas (X)
                        const padding = pdfWidth * 0.22;
                        const thickness = pdfWidth * 0.12;
                        page.drawLine({
                            start: { x: pdfX + padding, y: pdfY + pdfHeight - padding },
                            end: { x: pdfX + pdfWidth - padding, y: pdfY + padding },
                            thickness: thickness,
                            color: color,
                        });
                        page.drawLine({
                            start: { x: pdfX + padding, y: pdfY + padding },
                            end: { x: pdfX + pdfWidth - padding, y: pdfY + pdfHeight - padding },
                            thickness: thickness,
                            color: color,
                        });
                    } else if (cb.symbol === 'check') {
                        // Dibujar el Tick del Checkmark en 2 trazos vectoriales conectados
                        const thickness = pdfWidth * 0.12;
                        const p1 = { x: pdfX + pdfWidth * 0.22, y: pdfY + pdfHeight * 0.48 };
                        const p2 = { x: pdfX + pdfWidth * 0.45, y: pdfY + pdfHeight * 0.24 };
                        const p3 = { x: pdfX + pdfWidth * 0.78, y: pdfY + pdfHeight * 0.76 };

                        page.drawLine({
                            start: p1,
                            end: p2,
                            thickness: thickness,
                            color: color,
                        });
                        page.drawLine({
                            start: p2,
                            end: p3,
                            thickness: thickness,
                            color: color,
                        });
                    }
                }
            }

            // --- 5. GENERAR DESCARGA DEL ARCHIVO CON FILE SYSTEM ACCESS API ---
            const modifiedPdfBytes = await pdfDoc.save();
            let filename = customFilename || 'PDFiller2_documento_editado.pdf';
            
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Documento PDF',
                            accept: {
                                'application/pdf': ['.pdf'],
                            },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(modifiedPdfBytes);
                    await writable.close();
                    console.log('¡PDF guardado con éxito mediante showSaveFilePicker!');
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log('El usuario canceló el diálogo de guardado.');
                        return;
                    }
                    console.warn('Error al usar showSaveFilePicker, usando descarga tradicional:', err);
                    triggerClassicDownload(modifiedPdfBytes, filename);
                }
            } else {
                // Fallback tradicional si no está soportado showSaveFilePicker
                const inputName = prompt("Introduce el nombre con el que deseas guardar el PDF:", filename);
                if (inputName !== null) {
                    filename = inputName.trim() || filename;
                    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
                    triggerClassicDownload(modifiedPdfBytes, filename);
                }
            }

            console.log('¡PDF compilado y descargado con éxito!');
        } catch (err) {
            console.error('Error al compilar el PDF:', err);
            alert('Ocurrió un error al compilar el PDF para su descarga: ' + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    };

    return {
        showWarningBanner: showWarningBanner,
        exportModifiedPdf: exportModifiedPdf
    };
})();
