// backend/utils/jspdf-html-renderer.js
const { jsPDF } = require('jspdf');

class TextSegment {
  constructor(text, options = {}) {
    this.text = text;
    this.bold = options.bold || false;
    this.italic = options.italic || false;
    this.underline = options.underline || false;
    this.strikethrough = options.strikethrough || false;
    this.color = options.color;
    this.backgroundColor = options.backgroundColor;
    this.fontSize = options.fontSize;
  }
}

class ParsedElement {
  constructor(type, content, styles = {}, options = {}) {
    this.type = type;
    this.content = content;
    this.styles = styles;
    this.level = options.level;
    this.listType = options.listType;
    this.listNumber = options.listNumber;
  }
}

const parseFontSize = (styleString, defaultSize = 9, parentFontSize) => {
  const sizeMatch = styleString.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt|em|rem)?/);
  if (sizeMatch) {
    const size = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2];
    
    if (!unit || unit === 'px') {
      return size * 0.85;
    } else if (unit === 'pt') {
      return size;
    } else if (unit === 'em') {
      return (parentFontSize || defaultSize) * size;
    } else if (unit === 'rem') {
      return 16 * 0.75 * size;
    }
  }
  
  if (styleString.includes('ql-size-small')) return defaultSize * 0.85;
  if (styleString.includes('ql-size-large')) return defaultSize * 1.5;
  if (styleString.includes('ql-size-huge')) return defaultSize * 2.5;
  
  return defaultSize;
};

const extractTextSegments = (element, parentFontSize) => {
  const segments = [];
  
  const processNode = (node, inheritedStyles = {}) => {
    if (node.nodeType === node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) {
        segments.push(new TextSegment(text, inheritedStyles));
      }
    } else if (node.nodeType === node.ELEMENT_NODE) {
      const el = node;
      const newStyles = { ...inheritedStyles };
      
      if (el.tagName === 'STRONG' || el.tagName === 'B') {
        newStyles.bold = true;
      }
      if (el.tagName === 'EM' || el.tagName === 'I') {
        newStyles.italic = true;
      }
      if (el.tagName === 'U') {
        newStyles.underline = true;
      }
      if (el.tagName === 'S' || el.tagName === 'STRIKE' || el.tagName === 'DEL') {
        newStyles.strikethrough = true;
      }
      
      const style = el.getAttribute('style');
      if (style) {
        const fontSize = parseFontSize(style, 9, parentFontSize);
        if (fontSize !== 9) {
          newStyles.fontSize = fontSize;
        }
        
        const colorMatch = style.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (colorMatch) {
          newStyles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
        }
        
        const bgMatch = style.match(/background-color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (bgMatch) {
          newStyles.backgroundColor = `rgb(${bgMatch[1]}, ${bgMatch[2]}, ${bgMatch[3]})`;
        }
      }
      
      if (el.classList.contains('ql-size-small')) {
        newStyles.fontSize = 9 * 0.85;
      } else if (el.classList.contains('ql-size-large')) {
        newStyles.fontSize = 9 * 1.5;
      } else if (el.classList.contains('ql-size-huge')) {
        newStyles.fontSize = 9 * 2.5;
      }
      
      if (el.tagName === 'SPAN') {
        const className = el.className;
        if (className.includes('ql-size-small')) {
          newStyles.fontSize = 9 * 0.85;
        } else if (className.includes('ql-size-large')) {
          newStyles.fontSize = 9 * 1.5;
        } else if (className.includes('ql-size-huge')) {
          newStyles.fontSize = 9 * 2.5;
        }
      }
      
      Array.from(el.childNodes).forEach(child => processNode(child, newStyles));
    }
  };
  
  Array.from(element.childNodes).forEach(child => processNode(child));
  return segments;
};

const parseHtmlToElementsForJsPDF = (html, defaultFontSize = 9) => {
  // For backend, we'll use a simple regex-based parser since we don't have DOM access
  // This is a simplified version - you might want to use a proper HTML parser like 'htmlparser2'
  const result = [];
  
  // Split by paragraphs and lists
  const lines = html.split(/(<p[^>]*>|<\/p>|<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>|<li[^>]*>|<\/li>|<h[1-3][^>]*>|<\/h[1-3]>)/gi);
  
  let currentElement = null;
  let inParagraph = false;
  let inList = false;
  let listType = null;
  let listCounter = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for opening tags
    if (line.match(/^<p[^>]*>/i)) {
      inParagraph = true;
      currentElement = {
        type: 'paragraph',
        content: [],
        styles: getStylesFromTag(line, defaultFontSize)
      };
    } else if (line.match(/^<ul[^>]*>/i)) {
      inList = true;
      listType = 'unordered';
      listCounter = 0;
    } else if (line.match(/^<ol[^>]*>/i)) {
      inList = true;
      listType = 'ordered';
      listCounter = 0;
    } else if (line.match(/^<li[^>]*>/i) && inList) {
      listCounter++;
      currentElement = {
        type: 'list',
        content: [],
        styles: getStylesFromTag(line, defaultFontSize),
        listType: listType,
        listNumber: listType === 'ordered' ? listCounter : undefined
      };
    } else if (line.match(/^<h([1-3])[^>]*>/i)) {
      const level = parseInt(line.match(/^<h([1-3])/i)[1]);
      currentElement = {
        type: 'heading',
        content: [],
        styles: getHeadingStylesFromTag(line, defaultFontSize, level),
        level: level
      };
    }
    // Check for closing tags
    else if (line === '</p>' && inParagraph && currentElement) {
      if (currentElement.content.length > 0) {
        result.push(new ParsedElement(
          currentElement.type,
          currentElement.content,
          currentElement.styles
        ));
      }
      inParagraph = false;
      currentElement = null;
    } else if ((line === '</ul>' || line === '</ol>') && inList) {
      inList = false;
      listType = null;
      listCounter = 0;
    } else if (line === '</li>' && inList && currentElement) {
      if (currentElement.content.length > 0) {
        result.push(new ParsedElement(
          currentElement.type,
          currentElement.content,
          currentElement.styles,
          {
            listType: currentElement.listType,
            listNumber: currentElement.listNumber
          }
        ));
      }
      currentElement = null;
    } else if (line.match(/^<\/h[1-3]>$/i) && currentElement) {
      if (currentElement.content.length > 0) {
        result.push(new ParsedElement(
          currentElement.type,
          currentElement.content,
          currentElement.styles,
          { level: currentElement.level }
        ));
      }
      currentElement = null;
    }
    // Text content
    else if (currentElement && !line.startsWith('<') && !line.endsWith('>')) {
      // Simple text extraction - you might want to enhance this
      const text = line.replace(/<[^>]*>/g, '').trim();
      if (text) {
        currentElement.content.push(new TextSegment(text));
      }
    }
  }
  
  return result;
};

// Helper functions for backend HTML parsing
const getStylesFromTag = (tag, defaultFontSize) => {
  const styles = {
    fontSize: defaultFontSize,
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
  };

  if (tag.includes('ql-align-center')) styles.textAlign = 'center';
  if (tag.includes('ql-align-right')) styles.textAlign = 'right';
  if (tag.includes('ql-align-justify')) styles.textAlign = 'justify';

  if (tag.includes('ql-size-small')) {
    styles.fontSize = defaultFontSize * 0.75;
  } else if (tag.includes('ql-size-large')) {
    styles.fontSize = defaultFontSize * 1.5;
  } else if (tag.includes('ql-size-huge')) {
    styles.fontSize = defaultFontSize * 2.5;
  }

  const styleMatch = tag.match(/style="([^"]*)"/);
  if (styleMatch) {
    const styleAttr = styleMatch[1];
    const fontSize = parseFontSize(styleAttr, styles.fontSize || defaultFontSize, styles.fontSize || defaultFontSize);
    if (fontSize !== defaultFontSize) {
      styles.fontSize = fontSize;
    }

    const fontMatch = styleAttr.match(/font-family:\s*["']?([^;"']+)["']?/);
    if (fontMatch) {
      styles.fontFamily = fontMatch[1];
    }

    const colorMatch = styleAttr.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (colorMatch) {
      styles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
    }

    const bgMatch = styleAttr.match(/background-color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (bgMatch) {
      styles.backgroundColor = `rgb(${bgMatch[1]}, ${bgMatch[2]}, ${bgMatch[3]})`;
    }
  }

  return styles;
};

const getHeadingStylesFromTag = (tag, defaultFontSize, level) => {
  const styles = {
    fontSize: defaultFontSize + (8 - level * 2),
    fontWeight: 'bold',
    textAlign: 'left',
  };

  if (tag.includes('ql-align-center')) styles.textAlign = 'center';
  if (tag.includes('ql-align-right')) styles.textAlign = 'right';
  if (tag.includes('ql-align-justify')) styles.textAlign = 'justify';

  const styleMatch = tag.match(/style="([^"]*)"/);
  if (styleMatch) {
    const styleAttr = styleMatch[1];
    const colorMatch = styleAttr.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (colorMatch) {
      styles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
    }
  }

  return styles;
};

const getListItemStylesFromTag = (tag, defaultFontSize) => {
  const styles = {
    fontSize: defaultFontSize,
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
    marginLeft: 10,
  };

  if (tag.includes('ql-align-center')) styles.textAlign = 'center';
  if (tag.includes('ql-align-right')) styles.textAlign = 'right';
  if (tag.includes('ql-align-justify')) styles.textAlign = 'justify';

  if (tag.includes('ql-size-small')) {
    styles.fontSize = defaultFontSize * 0.75;
  } else if (tag.includes('ql-size-large')) {
    styles.fontSize = defaultFontSize * 1.5;
  } else if (tag.includes('ql-size-huge')) {
    styles.fontSize = defaultFontSize * 2.5;
  }

  const styleMatch = tag.match(/style="([^"]*)"/);
  if (styleMatch) {
    const styleAttr = styleMatch[1];
    const fontSize = parseFontSize(styleAttr, styles.fontSize || defaultFontSize, styles.fontSize || defaultFontSize);
    if (fontSize !== defaultFontSize) {
      styles.fontSize = fontSize;
    }

    const fontMatch = styleAttr.match(/font-family:\s*["']?([^;"']+)["']?/);
    if (fontMatch) {
      styles.fontFamily = fontMatch[1];
    }

    const colorMatch = styleAttr.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (colorMatch) {
      styles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
    }

    const bgMatch = styleAttr.match(/background-color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (bgMatch) {
      styles.backgroundColor = `rgb(${bgMatch[1]}, ${bgMatch[2]}, ${bgMatch[3]})`;
    }
  }

  return styles;
};

const renderParsedElementsWithJsPDF = (
  doc,
  elements,
  startX,
  startY,
  maxWidth,
  pageWidth,
  pageHeight,
  drawHeader
) => {
  let currentY = startY;
  const lineHeight = 12;
  const bottomMargin = 40;
  const HEADER_HEIGHT_AFTER_BREAK = 228 + 12;

  elements.forEach((element) => {
    const fontSize = element.styles.fontSize || 9;
    const textAlign = element.styles.textAlign || 'left';
    
    if (currentY + lineHeight > pageHeight - bottomMargin) {
      doc.addPage();
      drawHeader(false);
      currentY = HEADER_HEIGHT_AFTER_BREAK;
    }
    
    if (element.type === 'paragraph' || element.type === 'heading') {
      const segments = Array.isArray(element.content) ? element.content : [new TextSegment(element.content)];
      
      let currentLine = [];
      let lineStartY = currentY;

      const drawCurrentLine = () => {
        if (currentLine.length === 0) return;
        
        if (lineStartY + lineHeight > pageHeight - bottomMargin) {
          doc.addPage();
          drawHeader(false);
          lineStartY = HEADER_HEIGHT_AFTER_BREAK;
        }
        
        // Calculate total width of the line
        let totalWidth = 0;
        currentLine.forEach(item => {
          const segment = item.segment;
          let fontStyle = 'normal';
          if (segment.bold && segment.italic) {
            fontStyle = 'bolditalic';
          } else if (segment.bold) {
            fontStyle = 'bold';
          } else if (segment.italic) {
            fontStyle = 'italic';
          }
          doc.setFont('helvetica', fontStyle);
          doc.setFontSize(segment.fontSize || fontSize);
          totalWidth += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
        });
        
        // Calculate starting X based on alignment
        let lineX = startX;
        if (textAlign === 'center') {
          lineX = startX + (maxWidth - totalWidth) / 2;
        } else if (textAlign === 'right') {
          lineX = startX + maxWidth - totalWidth;
        }
        
        // Draw each segment
        currentLine.forEach(item => {
          const segment = item.segment;
          let fontStyle = 'normal';
          
          if (segment.bold && segment.italic) {
            fontStyle = 'bolditalic';
          } else if (segment.bold) {
            fontStyle = 'bold';
          } else if (segment.italic) {
            fontStyle = 'italic';
          }
          
          doc.setFont('helvetica', fontStyle);
          doc.setFontSize(segment.fontSize || fontSize);
          
          if (segment.color) {
            const rgbMatch = segment.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
              doc.setTextColor(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
            }
          } else {
            doc.setTextColor(52, 58, 64);
          }
          
          doc.text(item.text, lineX, lineStartY);
          lineX += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
        });
        
        lineStartY += lineHeight;
        currentLine = [];
      };

      segments.forEach((segment) => {
        let fontStyle = 'normal';
        
        if (segment.bold && segment.italic) {
          fontStyle = 'bolditalic';
        } else if (segment.bold) {
          fontStyle = 'bold';
        } else if (segment.italic) {
          fontStyle = 'italic';
        }
        
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(segment.fontSize || fontSize);

        const words = segment.text.split(/\s+/);
        
        words.forEach((word) => {
          const testLineItems = [...currentLine, {segment, text: word}];
          let testWidth = 0;
          
          testLineItems.forEach(item => {
            const seg = item.segment;
            let fs = 'normal';
            if (seg.bold && seg.italic) fs = 'bolditalic';
            else if (seg.bold) fs = 'bold';
            else if (seg.italic) fs = 'italic';
            
            doc.setFont('helvetica', fs);
            doc.setFontSize(seg.fontSize || fontSize);
            testWidth += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
          });
          
          if (testLineItems.length > 1) {
            testWidth += doc.getStringUnitWidth(' ') * doc.getFontSize() / doc.internal.scaleFactor * (testLineItems.length - 1);
          }
          
          if (testWidth > maxWidth && currentLine.length > 0) {
            drawCurrentLine();
          }
          
          if (currentLine.length > 0) {
            currentLine.push({segment, text: ' ' + word});
          } else {
            currentLine.push({segment, text: word});
          }
        });
      });
      
      drawCurrentLine();
      currentY = lineStartY + 6;
      
    } else if (element.type === 'list') {
      const prefix = element.listType === 'ordered' 
        ? `${element.listNumber}. ` 
        : '• ';
      
      const segments = Array.isArray(element.content) ? element.content : [new TextSegment(element.content)];
      
      if (currentY + lineHeight > pageHeight - bottomMargin) {
        doc.addPage();
        drawHeader(false);
        currentY = HEADER_HEIGHT_AFTER_BREAK;
      }

      let currentLine = [];
      let lineStartY = currentY;
      let isFirstLine = true;
      
      const drawCurrentLine = () => {
        if (currentLine.length === 0) return;
        
        if (lineStartY + lineHeight > pageHeight - bottomMargin) {
          doc.addPage();
          drawHeader(false);
          lineStartY = HEADER_HEIGHT_AFTER_BREAK;
        }
        
        // Calculate total width including prefix for first line
        let totalWidth = 0;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        const prefixWidth = doc.getStringUnitWidth(prefix) * doc.getFontSize() / doc.internal.scaleFactor;
        
        currentLine.forEach(item => {
          const segment = item.segment;
          let fontStyle = 'normal';
          if (segment.bold && segment.italic) {
            fontStyle = 'bolditalic';
          } else if (segment.bold) {
            fontStyle = 'bold';
          } else if (segment.italic) {
            fontStyle = 'italic';
          }
          doc.setFont('helvetica', fontStyle);
          doc.setFontSize(segment.fontSize || fontSize);
          totalWidth += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
        });
        
        // Calculate starting X position based on alignment
        let lineX = startX;
        if (textAlign === 'center') {
          const fullWidth = isFirstLine ? prefixWidth + totalWidth : totalWidth;
          lineX = startX + (maxWidth - fullWidth) / 2;
        } else if (textAlign === 'right') {
          const fullWidth = isFirstLine ? prefixWidth + totalWidth : totalWidth;
          lineX = startX + maxWidth - fullWidth;
        }
        
        // Draw prefix on first line
        if (isFirstLine) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
          doc.setTextColor(52, 58, 64);
          doc.text(prefix, lineX, lineStartY);
          lineX += prefixWidth;
          isFirstLine = false;
        }
        
        // Draw text segments
        currentLine.forEach(item => {
          const segment = item.segment;
          let fontStyle = 'normal';
          
          if (segment.bold && segment.italic) {
            fontStyle = 'bolditalic';
          } else if (segment.bold) {
            fontStyle = 'bold';
          } else if (segment.italic) {
            fontStyle = 'italic';
          }
          
          doc.setFont('helvetica', fontStyle);
          doc.setFontSize(segment.fontSize || fontSize);
          
          if (segment.color) {
            const rgbMatch = segment.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
              doc.setTextColor(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
            }
          } else {
            doc.setTextColor(52, 58, 64);
          }
          
          doc.text(item.text, lineX, lineStartY);
          lineX += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
        });
        
        lineStartY += lineHeight;
        currentLine = [];
      };

      segments.forEach((segment) => {
        let fontStyle = 'normal';
        
        if (segment.bold && segment.italic) {
          fontStyle = 'bolditalic';
        } else if (segment.bold) {
          fontStyle = 'bold';
        } else if (segment.italic) {
          fontStyle = 'italic';
        }
        
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(segment.fontSize || fontSize);

        const words = segment.text.split(/\s+/);
        
        words.forEach((word) => {
          const testLineItems = [...currentLine, {segment, text: word}];
          let testWidth = 0;
          
          testLineItems.forEach(item => {
            const seg = item.segment;
            let fs = 'normal';
            if (seg.bold && seg.italic) fs = 'bolditalic';
            else if (seg.bold) fs = 'bold';
            else if (seg.italic) fs = 'italic';
            
            doc.setFont('helvetica', fs);
            doc.setFontSize(seg.fontSize || fontSize);
            testWidth += doc.getStringUnitWidth(item.text) * doc.getFontSize() / doc.internal.scaleFactor;
          });
          
          if (testLineItems.length > 1) {
            testWidth += doc.getStringUnitWidth(' ') * doc.getFontSize() / doc.internal.scaleFactor * (testLineItems.length - 1);
          }
          
          // Add prefix width for first line calculation
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
          const prefixWidth = doc.getStringUnitWidth(prefix) * doc.getFontSize() / doc.internal.scaleFactor;
          const availableWidth = isFirstLine ? maxWidth - prefixWidth : maxWidth;
          
          if (testWidth > availableWidth && currentLine.length > 0) {
            drawCurrentLine();
          }
          
          if (currentLine.length > 0) {
            currentLine.push({segment, text: ' ' + word});
          } else {
            currentLine.push({segment, text: word});
          }
        });
      });
      
      drawCurrentLine();
      currentY = lineStartY + 4;
    }
  });

  return currentY;
};

module.exports = {
  TextSegment,
  ParsedElement,
  parseHtmlToElementsForJsPDF,
  renderParsedElementsWithJsPDF
};