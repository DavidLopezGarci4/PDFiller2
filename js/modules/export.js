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
        if (window.showNotificationToast) {
            window.showNotificationToast('¡Descarga iniciada!');
        }
    };

    // --- 1. GUARDADO VECTORIAL ESTÁNDAR ---
    const exportModifiedPdf = async (customFilename = null) => {
        if (!window.pdfBytes) return;

        console.log('Iniciando compilación física del PDF...');
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.querySelector('p').textContent = 'Generando archivo PDF final...';
        loadingOverlay.classList.add('active');

        try {
            const modifiedPdfBytes = await getCompiledVectorBytes();
            let filename = customFilename || 'PDFiller2_documento_editado.pdf';
            await triggerDownloadFile(modifiedPdfBytes, filename, 'application/pdf');
            console.log('¡PDF compilado y descargado con éxito!');
        } catch (err) {
            console.error('Error al compilar el PDF:', err);
            alert('Ocurrió un error al compilar el PDF para su descarga: ' + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    };

    // --- 2. GUARDADO APLANADO SEGURO (RASTERIZADO PARA LLM / IA) ---
    const exportFlattenedPdf = async (customFilename = null) => {
        if (!window.pdfBytes) return;

        console.log('Iniciando aplanado físico de páginas del PDF (Seguridad IA)...');
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.querySelector('p').textContent = 'Aplanando documento...';
        loadingOverlay.classList.add('active');

        try {
            // A. Obtener bytes del PDF compilado estándar (con todos los textos y correctores integrados)
            const vectorBytes = await getCompiledVectorBytes();

            // B. Crear un nuevo documento PDF en blanco usando pdf-lib
            const flattenedPdfDoc = await PDFLib.PDFDocument.create();

            // C. Cargar los bytes en PDF.js para renderizar página a página a canvas
            const loadingTask = pdfjsLib.getDocument({ data: vectorBytes });
            const pdfInstance = await loadingTask.promise;

            // D. Iterar y rasterizar cada página a una alta resolución (escala 2.0)
            for (let i = 1; i <= pdfInstance.numPages; i++) {
                loadingOverlay.querySelector('p').textContent = `Rasterizando página ${i} de ${pdfInstance.numPages}...`;

                const page = await pdfInstance.getPage(i);
                // Escala 2.0 ofrece un balance óptimo de alta nitidez en móviles/pantallas sin excesivo peso
                const viewport = page.getViewport({ scale: 2.0 });

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const tempCtx = tempCanvas.getContext('2d');

                // Renderizar la página del PDF vectorial con todas sus anotaciones en el canvas temporal
                await page.render({ canvasContext: tempCtx, viewport: viewport }).promise;

                // Extraer a JPEG (es comprimido, ideal para mantener un PDF liviano)
                const imgDataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
                const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());

                // Empotrar la imagen e insertarla en el nuevo PDF aplanado con el tamaño original (escala 1.0)
                const embeddedImg = await flattenedPdfDoc.embedJpg(imgBytes);
                const newPage = flattenedPdfDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);
                newPage.drawImage(embeddedImg, {
                    x: 0,
                    y: 0,
                    width: viewport.width / 2.0,
                    height: viewport.height / 2.0
                });
            }

            const flattenedPdfBytes = await flattenedPdfDoc.save();

            let filename = customFilename || 'PDFiller2_documento_editado.pdf';
            if (filename.endsWith('.pdf')) {
                filename = filename.replace('.pdf', '_aplanado.pdf');
            } else {
                filename += '_aplanado.pdf';
            }

            await triggerDownloadFile(flattenedPdfBytes, filename, 'application/pdf');
            console.log('¡PDF aplanado y guardado con éxito!');
        } catch (err) {
            console.error('Error al aplanar el PDF:', err);
            alert('Ocurrió un error al aplanar el PDF para IA: ' + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    };

    // --- 3. EXPORTACIÓN EN TEXTO PLANO / MARKDOWN ---
    const exportMarkdownText = async (customFilename = null) => {
        if (!window.pdfFields || window.pdfFields.length === 0) {
            alert('No hay campos de texto disponibles para exportar.');
            return;
        }

        console.log('Generando archivo de texto Markdown transcrito...');
        try {
            // Filtrar campos activos de la página (omitir eliminados)
            const activeFields = window.pdfFields.filter(f => !f.deleted);
            if (activeFields.length === 0) {
                alert('No hay texto activo en el documento.');
                return;
            }

            // Agrupar por número de página
            const pagesMap = {};
            activeFields.forEach(field => {
                const pNum = field.pageNum || 1;
                if (!pagesMap[pNum]) pagesMap[pNum] = [];
                pagesMap[pNum].push(field);
            });

            const originalName = window.pdfFileName ? window.pdfFileName.replace('.pdf', '') : 'documento';
            let filename = `${originalName}_transcripcion.md`;

            let mdContent = `# Transcripción y Edición de Documento (Seguro para LLM)\n`;
            mdContent += `*Documento original: ${window.pdfFileName || 'Desconocido'}*\n`;
            mdContent += `*Fecha de exportación: ${new Date().toLocaleString()}*\n\n`;
            mdContent += `---\n\n`;

            const sortedPages = Object.keys(pagesMap).sort((a, b) => Number(a) - Number(b));

            for (const pNum of sortedPages) {
                mdContent += `## PÁGINA ${pNum}\n\n`;
                const pageFields = pagesMap[pNum];

                // Agrupar campos en líneas horizontales (tolerancia de 10px en coordenada Y)
                const sortedFields = [...pageFields].sort((a, b) => a.y - b.y);
                const lines = [];
                let currentLine = [];

                for (const f of sortedFields) {
                    if (currentLine.length === 0) {
                        currentLine.push(f);
                    } else {
                        const prev = currentLine[currentLine.length - 1];
                        if (Math.abs(f.y - prev.y) < 10) {
                            currentLine.push(f);
                        } else {
                            // Ordenar horizontalmente de izquierda a derecha (coordenada X)
                            currentLine.sort((a, b) => a.x - b.x);
                            lines.push(currentLine);
                            currentLine = [f];
                        }
                    }
                }
                if (currentLine.length > 0) {
                    currentLine.sort((a, b) => a.x - b.x);
                    lines.push(currentLine);
                }

                // Escribir líneas en formato legible Markdown
                for (const line of lines) {
                    const lineText = line.map(f => f.text.trim()).filter(t => t.length > 0).join('  |  ');
                    if (lineText.length > 0) {
                        mdContent += `> ${lineText}\n\n`;
                    }
                }
                mdContent += `\n---\n\n`;
            }

            const encoder = new TextEncoder();
            const mdBytes = encoder.encode(mdContent);

            await triggerDownloadFile(mdBytes, filename, 'text/markdown');
            console.log('¡Texto plano Markdown exportado con éxito!');
        } catch (err) {
            console.error('Error al exportar texto:', err);
            alert('Ocurrió un error al extraer el texto Markdown: ' + err.message);
        }
    };

    return {
        showWarningBanner: showWarningBanner,
        exportModifiedPdf: exportModifiedPdf,
        exportFlattenedPdf: exportFlattenedPdf,
        exportMarkdownText: exportMarkdownText
    };
})();
