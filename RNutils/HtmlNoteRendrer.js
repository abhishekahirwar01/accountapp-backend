// backend/utils/HtmlNoteRenderer.js
const { JSDOM } = require('jsdom');

// Server-side DOM parser
const createDOMParser = () => {
  const { window } = new JSDOM();
  return new window.DOMParser();
};

// Helper function to parse font size from style string
const parseFontSize = (styleString, defaultSize = 8, parentFontSize) => {
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
      return 16 * 0.85 * size;
    }
  }
  
  // Check for Quill size classes
  if (styleString.includes('ql-size-small')) return defaultSize * 1.0;
  if (styleString.includes('ql-size-large')) return defaultSize * 1.5;
  if (styleString.includes('ql-size-huge')) return defaultSize * 2.5;
  
  return defaultSize;
};

// Helper function to extract inline formatted text segments
const extractTextSegments = (element, parentFontSize) => {
  const segments = [];
  
  const processNode = (node, inheritedStyles = {}) => {
    if (node.nodeType === node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text.trim()) {
        segments.push({
          text,
          ...inheritedStyles
        });
      }
    } else if (node.nodeType === node.ELEMENT_NODE) {
      const el = node;
      const newStyles = { ...inheritedStyles };
      
      // Check for formatting tags
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
      
      // Check inline styles
      const style = el.getAttribute("style");
      if (style) {
        // Parse font size
        const fontSize = parseFontSize(style, 8, parentFontSize);
        if (fontSize !== 8) {
          newStyles.fontSize = fontSize;
        }
        
        // Parse color
        const colorMatch = style.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (colorMatch) {
          newStyles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
        }
        
        // Parse background color
        const bgMatch = style.match(/background-color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (bgMatch) {
          newStyles.backgroundColor = `rgb(${bgMatch[1]}, ${bgMatch[2]}, ${bgMatch[3]})`;
        }
      }
      
      // Check for Quill size classes
      if (el.classList.contains('ql-size-small')) {
        newStyles.fontSize = 8 * 1.0;
      } else if (el.classList.contains('ql-size-large')) {
        newStyles.fontSize = 8 * 1.5;
      } else if (el.classList.contains('ql-size-huge')) {
        newStyles.fontSize = 8 * 2.5;
      }
      
      // Check for span with size class
      if (el.tagName === 'SPAN') {
        const className = el.className;
        if (className.includes('ql-size-small')) {
          newStyles.fontSize = 8 * 1.0;
        } else if (className.includes('ql-size-large')) {
          newStyles.fontSize = 8 * 1.5;
        } else if (className.includes('ql-size-huge')) {
          newStyles.fontSize = 8 * 2.5;
        }
      }
      
      // Process children
      Array.from(el.childNodes).forEach(child => processNode(child, newStyles));
    }
  };
  
  Array.from(element.childNodes).forEach(child => processNode(child));
  return segments;
};

// Helper function to get paragraph styles
function getParagraphStyles(el, defaultFontSize) {
  const styles = {
    fontSize: defaultFontSize,
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
  };

  // Check alignment classes
  if (el.classList.contains('ql-align-center')) styles.textAlign = 'center';
  if (el.classList.contains('ql-align-right')) styles.textAlign = 'right';
  if (el.classList.contains('ql-align-justify')) styles.textAlign = 'justify';

  // Check font size classes
  if (el.classList.contains('ql-size-small')) {
    styles.fontSize = defaultFontSize * 1.0;
  } else if (el.classList.contains('ql-size-large')) {
    styles.fontSize = defaultFontSize * 1.5;
  } else if (el.classList.contains('ql-size-huge')) {
    styles.fontSize = defaultFontSize * 2.5;
  }

  // Parse inline styles
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
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
}

// Helper function to get heading styles
function getHeadingStyles(el, defaultFontSize, level) {
  const styles = {
    fontSize: defaultFontSize + (8 - level * 2),
    fontWeight: 'bold',
    textAlign: 'left'
  };

  // Check alignment
  if (el.classList.contains('ql-align-center')) styles.textAlign = 'center';
  if (el.classList.contains('ql-align-right')) styles.textAlign = 'right';
  if (el.classList.contains('ql-align-justify')) styles.textAlign = 'justify';

  // Parse inline styles
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const colorMatch = styleAttr.match(/color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (colorMatch) {
      styles.color = `rgb(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]})`;
    }
  }

  return styles;
}

// Helper function to get list item styles
function getListItemStyles(el, defaultFontSize) {
  const styles = {
    fontSize: defaultFontSize,
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
    marginLeft: 10,
  };

  // Check alignment
  if (el.classList.contains('ql-align-center')) styles.textAlign = 'center';
  if (el.classList.contains('ql-align-right')) styles.textAlign = 'right';
  if (el.classList.contains('ql-align-justify')) styles.textAlign = 'justify';

  // Check font size classes
  if (el.classList.contains('ql-size-small')) {
    styles.fontSize = defaultFontSize * 1.0;
  } else if (el.classList.contains('ql-size-large')) {
    styles.fontSize = defaultFontSize * 1.5;
  } else if (el.classList.contains('ql-size-huge')) {
    styles.fontSize = defaultFontSize * 2.5;
  }

  // Parse inline styles
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
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
}

// Main function to parse HTML to elements
const parseHtmlToElements = (html, defaultFontSize = 8) => {
  if (!html || typeof html !== 'string') return [];

  const parser = createDOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  
  const result = [];
  let orderedListCounter = 0;
  let currentListType = null;

  const children = Array.from(body.children);

  children.forEach((el) => {
    // Check for Quill's data-list attribute
    const dataListAttr = el.getAttribute('data-list');
    
    let isListItem = false;
    let listType = null;

    // Determine list type
    if (dataListAttr === 'ordered') {
      isListItem = true;
      listType = 'ordered';
    } else if (dataListAttr === 'bullet') {
      isListItem = true;
      listType = 'unordered';
    } else if (el.tagName === 'OL' || el.closest('ol')) {
      isListItem = true;
      listType = 'ordered';
    } else if (el.tagName === 'UL' || el.closest('ul')) {
      isListItem = true;
      listType = 'unordered';
    } else if (el.tagName === 'LI') {
      const parent = el.parentElement;
      if (parent?.tagName === 'OL') {
        isListItem = true;
        listType = 'ordered';
      } else if (parent?.tagName === 'UL') {
        isListItem = true;
        listType = 'unordered';
      } else {
        const prevSibling = el.previousElementSibling;
        if (prevSibling?.getAttribute('data-list') === 'ordered') {
          isListItem = true;
          listType = 'ordered';
        } else if (prevSibling?.getAttribute('data-list') === 'bullet') {
          isListItem = true;
          listType = 'unordered';
        } else {
          isListItem = true;
          listType = 'unordered';
        }
      }
    }

    // Handle list type changes
    if (listType !== currentListType) {
      if (listType === 'ordered') {
        orderedListCounter = 0;
      }
      currentListType = listType;
    }

    if (!isListItem) {
      orderedListCounter = 0;
      currentListType = null;
    }

    // Process elements
    if (el.tagName === 'OL') {
      const listItems = el.querySelectorAll(':scope > li');
      let counter = 1;
      listItems.forEach((li) => {
        const textSegments = extractTextSegments(li);
        if (textSegments.length === 0) return;

        const liDataList = li.getAttribute('data-list');
        const actualListType = liDataList === 'bullet' ? 'unordered' : 
                               liDataList === 'ordered' ? 'ordered' : 'ordered';

        const styles = getListItemStyles(li, defaultFontSize);
        
        if (actualListType === 'ordered') {
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'ordered',
            listNumber: counter++
          });
        } else {
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'unordered',
          });
        }
      });
    } else if (el.tagName === 'UL') {
      const listItems = el.querySelectorAll(':scope > li');
      let counter = 1;
      listItems.forEach((li) => {
        const textSegments = extractTextSegments(li);
        if (textSegments.length === 0) return;

        const liDataList = li.getAttribute('data-list');
        const actualListType = liDataList === 'ordered' ? 'ordered' : 
                               liDataList === 'bullet' ? 'unordered' : 'unordered';

        const styles = getListItemStyles(li, defaultFontSize);
        
        if (actualListType === 'ordered') {
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'ordered',
            listNumber: counter++
          });
        } else {
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'unordered',
          });
        }
      });
    } else if (isListItem && listType) {
      const textSegments = extractTextSegments(el);
      if (textSegments.length > 0) {
        const styles = getListItemStyles(el, defaultFontSize);
        
        const sizeChild = el.querySelector('.ql-size-small, .ql-size-large, .ql-size-huge');
        if (sizeChild) {
          if (sizeChild.classList.contains('ql-size-small')) {
            styles.fontSize = defaultFontSize * 1.0;
          } else if (sizeChild.classList.contains('ql-size-large')) {
            styles.fontSize = defaultFontSize * 1.5;
          } else if (sizeChild.classList.contains('ql-size-huge')) {
            styles.fontSize = defaultFontSize * 2.5;
          }
        }
        
        if (listType === 'ordered') {
          orderedListCounter++;
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'ordered',
            listNumber: orderedListCounter,
          });
        } else {
          result.push({
            type: 'list',
            content: textSegments,
            styles,
            listType: 'unordered',
          });
        }
      }
    } else if (el.tagName === 'P') {
      const textSegments = extractTextSegments(el);
      if (textSegments.length === 0) return;

      const styles = getParagraphStyles(el, defaultFontSize);
      
      const sizeChild = el.querySelector('.ql-size-small, .ql-size-large, .ql-size-huge');
      if (sizeChild) {
        if (sizeChild.classList.contains('ql-size-small')) {
          styles.fontSize = defaultFontSize * 0.85;
        } else if (sizeChild.classList.contains('ql-size-large')) {
          styles.fontSize = defaultFontSize * 1.5;
        } else if (sizeChild.classList.contains('ql-size-huge')) {
          styles.fontSize = defaultFontSize * 2.5;
        }
      }
      
      result.push({
        type: 'paragraph',
        content: textSegments,
        styles,
      });
    } else if (['H1', 'H2', 'H3'].includes(el.tagName)) {
      const textSegments = extractTextSegments(el);
      if (textSegments.length === 0) return;

      const level = parseInt(el.tagName[1]);
      const styles = getHeadingStyles(el, defaultFontSize, level);
      result.push({
        type: 'heading',
        content: textSegments,
        styles,
        level,
      });
    }
  });

  return result;
};

// PDFKit compatible rendering function
const renderParsedElementsForPDFKit = (elements, doc, startX, startY, defaultFontSize = 8) => {
  let currentY = startY;
  
  elements.forEach((element) => {
    const fontSize = element.styles.fontSize || defaultFontSize;
    
    // Set base font properties
    doc.fontSize(fontSize);
    
    // Handle text alignment
    let x = startX;
    if (element.styles.textAlign === 'center') {
      // Center alignment would need text width calculation
    } else if (element.styles.textAlign === 'right') {
      // Right alignment logic
    }
    
    // Handle colors
    if (element.styles.color) {
      // PDFKit color setting would go here
    }
    
    if (element.type === 'list') {
      const prefix = element.listType === 'ordered' 
        ? `${element.listNumber || 1}. ` 
        : '• ';
      
      // Render list item
      const content = Array.isArray(element.content) 
        ? element.content.map(seg => seg.text).join('')
        : element.content;
      
      doc.text(prefix + content, x, currentY);
      currentY += fontSize + 2;
      
    } else if (element.type === 'paragraph' || element.type === 'heading') {
      const content = Array.isArray(element.content) 
        ? element.content.map(seg => seg.text).join('')
        : element.content;
      
      doc.text(content, x, currentY);
      currentY += fontSize + (element.type === 'heading' ? 4 : 2);
    }
  });
  
  return currentY;
};

module.exports = {
  parseHtmlToElements,
  renderParsedElementsForPDFKit
};