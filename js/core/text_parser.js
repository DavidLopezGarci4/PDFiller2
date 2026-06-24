// PDFiller 2 - Text Parsing and Horizontal Clustering Module
window.parsePdfTextContent = async (page, viewport) => {
    const pageNum = page.pageNumber || window.pdfPageNum || 1;
    console.log(`Iniciando extracción y parseo de campos con fusión horizontal para página ${pageNum}...`);
    
    const textContent = await page.getTextContent();
    const dropdown = document.getElementById('fields-dropdown');
    
    // Resetear dropdown (guardando la opción por defecto)
    dropdown.innerHTML = '<option value="" disabled selected>Selecciona un campo para editar...</option>';

    // 1. Extraer ítems crudos y calcular sus coordenadas de pantalla
    const rawItems = [];
    textContent.items.forEach((item) => {
        const str = item.str; // Conservar espacios y caracteres individuales para reconstrucción
        if (str === undefined || str === null) return;

        // Determinar alto de fuente de forma segura (PDF.js height o transform scale)
        let fontHeight = item.height;
        if (!fontHeight && item.transform && item.transform[3]) {
            fontHeight = Math.abs(item.transform[3]);
        }
        if (!fontHeight || isNaN(fontHeight)) {
            fontHeight = 12; // Fallback razonable
        }

        // Determinar ancho de fuente de forma segura (PDF.js width o estimación por caracteres)
        let textWidth = item.width;
        if (!textWidth || isNaN(textWidth)) {
            textWidth = str.length * fontHeight * 0.55; 
        }

        // Convertir coordenadas de PDF (Y empieza abajo) a coordenadas de pantalla (Y empieza arriba)
        const tx = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const x = tx[0];
        const y = tx[1] - (fontHeight * window.pdfScale); // Desplazamiento para alinear base
        const width = textWidth * window.pdfScale;
        const height = fontHeight * window.pdfScale;

        const fontName = item.fontName || 'Helvetica';
        const fontSizePx = Math.round(fontHeight * window.pdfScale);

        rawItems.push({
            str: str,
            x: x,
            y: y,
            width: width,
            height: height,
            fontName: fontName,
            fontSizePx: fontSizePx,
            fontHeight: fontHeight,
            originalX: item.transform[4],
            originalY: item.transform[5]
        });
    });

    // 2. Fusión Horizontal Inteligente (Clustering por línea vertical y cercanía horizontal)
    const mergedFields = [];

    rawItems.forEach(item => {
        const trimmedStr = item.str.trim();
        
        let merged = false;
        
        // Buscar de atrás hacia adelante en los campos combinados para mayor velocidad (ya que están en orden)
        for (let i = mergedFields.length - 1; i >= 0; i--) {
            const field = mergedFields[i];
            
            // Verificar si el elemento está en la misma línea vertical (margen de baseline Y < 4px)
            const sameLine = Math.abs(field.y - item.y) < 4;
            
            if (sameLine) {
                // Margen horizontal de seguridad: máximo de 30px o 2.5 veces el tamaño de la fuente para espacios
                const maxGap = Math.max(30, item.fontSizePx * 2.5);
                
                const isAfter = item.x >= field.x && item.x <= (field.x + field.width + maxGap);
                const isBefore = field.x >= item.x && field.x <= (item.x + item.width + maxGap);

                if (isAfter || isBefore) {
                    if (isAfter) {
                        // El nuevo fragmento está a la derecha del campo acumulado
                        const gap = item.x - (field.x + field.width);
                        // Añadir un espacio si hay separación física y no existe ya un espacio
                        const needsSpace = gap > 2 && !field.text.endsWith(' ') && !item.str.startsWith(' ');
                        field.text += (needsSpace ? ' ' : '') + item.str;
                        field.width = Math.max(field.width, (item.x + item.width) - field.x);
                    } else {
                        // El nuevo fragmento está a la izquierda (orden inverso)
                        const gap = field.x - (item.x + item.width);
                        const needsSpace = gap > 2 && !item.str.endsWith(' ') && !field.text.startsWith(' ');
                        field.text = item.str + (needsSpace ? ' ' : '') + field.text;
                        field.width = Math.max(field.width, (field.x + field.width) - item.x);
                        field.x = item.x;
                    }
                    
                    // Actualizar texto original para el control de cambios
                    field.originalText = field.text;
                    merged = true;
                    break;
                }
            }
        }

        if (!merged) {
            // Omitir fragmentos vacíos como campos independientes
            if (trimmedStr === '') return;

            // Determinar sección según el porcentaje de la altura de página
            const yPercent = (item.y / viewport.height) * 100;
            let sectionKey = 'cabecera';

            if (yPercent < 22) {
                sectionKey = 'cabecera';
            } else if (yPercent >= 22 && yPercent < 36) {
                sectionKey = 'datos';
            } else if (yPercent >= 36 && yPercent < 56) {
                sectionKey = 'tabla';
            } else if (yPercent >= 56 && yPercent < 72) {
                sectionKey = 'totales';
            } else {
                sectionKey = 'pie';
            }

            mergedFields.push({
                text: item.str,
                originalText: item.str,
                x: item.x,
                y: item.y,
                startX: item.x,
                startY: item.y,
                width: item.width,
                height: item.height,
                fontSize: item.fontSizePx,
                fontName: item.fontName,
                yPercent: yPercent,
                sectionKey: sectionKey,
                originalX: item.originalX,
                originalY: item.originalY,
                originalFontSize: item.fontHeight,
                pageNum: pageNum
            });
        }
    });

    // 3. Formatear y añadir padding a los campos combinados finales y asegurar que no desborden del viewport
    const finalFields = mergedFields.map((field, index) => {
        field.id = `field_${index}`;
        
        // Calcular el nuevo ancho y alto con padding
        let w = field.width + 20;
        let h = field.height + 6;
        
        // Asegurar que el ancho y alto no superen el viewport
        w = Math.min(w, viewport.width);
        h = Math.min(h, viewport.height);
        
        // Ajustar x e y si se desbordan del viewport
        let x = field.x;
        let y = field.y;
        
        if (x + w > viewport.width) {
            x = viewport.width - w;
        }
        if (x < 0) x = 0;
        
        if (y + h > viewport.height) {
            y = viewport.height - h;
        }
        if (y < 0) y = 0;
        
        field.x = x;
        field.y = y;
        field.width = w;
        field.height = h;
        
        // También ajustar startX y startY para que el static-cover-patch coincida y no se desborde
        let sx = field.startX;
        let sy = field.startY;
        let sw = field.width; // Usar el mismo ancho del parche que el campo final para cubrirlo bien
        let sh = field.height;
        
        if (sx + sw > viewport.width) {
            sx = viewport.width - sw;
        }
        if (sx < 0) sx = 0;
        
        if (sy + sh > viewport.height) {
            sy = viewport.height - sh;
        }
        if (sy < 0) sy = 0;
        
        field.startX = sx;
        field.startY = sy;
        
        // Limpiar espacios duplicados accidentales durante la fusión
        field.text = field.text.replace(/\s+/g, ' ');
        field.originalText = field.text;
        
        return field;
    });

    // Agrupación en secciones lógicas para rellenar el dropdown agrupado
    const sections = {
        cabecera: { name: '📌 Cabecera e Información General', items: [] },
        datos: { name: '👤 Datos de Cliente y Facturación', items: [] },
        tabla: { name: '📊 Tabla de Conceptos', items: [] },
        totales: { name: '💰 Totales e Impuestos', items: [] },
        pie: { name: '🖋️ Notas y Firmas', items: [] }
    };

    finalFields.forEach(field => {
        sections[field.sectionKey].items.push(field);
    });

    // Rellenar el dropdown agrupado en la interfaz
    Object.keys(sections).forEach(key => {
        const sec = sections[key];
        if (sec.items.length === 0) return;

        const optGroup = document.createElement('optgroup');
        optGroup.label = sec.name;

        sec.items.forEach(field => {
            const opt = document.createElement('option');
            opt.value = field.id;
            const previewText = field.text.length > 25 ? field.text.substring(0, 25) + '...' : field.text;
            opt.textContent = `${previewText} [Font: ${field.fontSize}px]`;
            optGroup.appendChild(opt);
        });

        dropdown.appendChild(optGroup);
    });

    // Guardar lista en variable global (preservando campos de otras páginas y estampas de esta página)
    window.pdfFields = (window.pdfFields || []).filter(f => f.pageNum !== pageNum || f.isStamp);
    window.pdfFields = [...window.pdfFields, ...finalFields];

    // Actualizar HUD de diagnóstico
    const hudScale = document.getElementById('hud-scale');
    const hudFields = document.getElementById('hud-fields');
    if (hudScale) hudScale.textContent = window.pdfScale.toFixed(2);
    if (hudFields) hudFields.textContent = window.pdfFields.length;
    
    if (window.editorModule && window.editorModule.initFieldsOverlay) {
        window.editorModule.initFieldsOverlay(window.pdfFields);
    }
};
