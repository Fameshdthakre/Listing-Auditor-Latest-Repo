/* 
 * picker.js
 * Injected into the active tab when the user clicks "Select Element" in the Side Panel.
 * Handles hovering, highlighting, and clicking elements to capture their HTML context.
 */

(function() {
  // Prevent multiple injections
  if (window.__LISTING_AUDITOR_PICKER_ACTIVE__) return;
  window.__LISTING_AUDITOR_PICKER_ACTIVE__ = true;

  // --- UI Elements ---
  const overlay = document.createElement('div');
  overlay.id = 'la-picker-overlay';
  Object.assign(overlay.style, {
    position: 'absolute',
    border: '2px solid #6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    pointerEvents: 'none',
    zIndex: '999999',
    transition: 'all 0.1s ease',
    display: 'none',
    borderRadius: '4px'
  });

  const tooltip = document.createElement('div');
  tooltip.id = 'la-picker-tooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    pointerEvents: 'none',
    zIndex: '1000000',
    display: 'none',
    fontFamily: 'sans-serif',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    whiteSpace: 'nowrap'
  });

  document.body.appendChild(overlay);
  document.body.appendChild(tooltip);

  let currentTarget = null;

  // --- Event Listeners ---
  const handleMouseMove = (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    
    // Ignore our own overlay/tooltip
    if (!target || target.id === 'la-picker-overlay' || target.id === 'la-picker-tooltip') return;

    if (currentTarget !== target) {
      currentTarget = target;
      updateHighlight(currentTarget);
    }
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentTarget) {
      // Capture context
      const elementData = {
        tagName: currentTarget.tagName.toLowerCase(),
        id: currentTarget.id,
        className: currentTarget.className,
        textContent: currentTarget.textContent.trim(),
        outerHTML: currentTarget.outerHTML,
        // Get surrounding context (parent's outerHTML) for AI to build better selectors
        parentHTML: currentTarget.parentElement ? currentTarget.parentElement.outerHTML : null
      };

      // Send message back to extension
      chrome.runtime.sendMessage({
        action: 'ELEMENT_SELECTED',
        data: elementData
      });

      // Cleanup
      cleanup();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      cleanup();
    } else if (e.key === 'ArrowUp' && currentTarget && currentTarget.parentElement && currentTarget.parentElement !== document.body) {
      e.preventDefault();
      currentTarget = currentTarget.parentElement;
      updateHighlight(currentTarget);
    } else if (e.key === 'ArrowDown' && currentTarget && currentTarget.firstElementChild) {
      e.preventDefault();
      currentTarget = currentTarget.firstElementChild;
      updateHighlight(currentTarget);
    }
  };

  const updateHighlight = (target) => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.left = `${rect.left + scrollX}px`;
    overlay.style.top = `${rect.top + scrollY}px`;
    overlay.style.display = 'block';

    tooltip.textContent = `Tag: <${target.tagName.toLowerCase()}> | Click to select`;
    tooltip.style.left = `${rect.left + scrollX}px`;
    tooltip.style.top = `${rect.top + scrollY - 30}px`; // Position above
    tooltip.style.display = 'block';
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    window.__LISTING_AUDITOR_PICKER_ACTIVE__ = false;
  };

  // Add listeners (use capture phase to intercept before page scripts)
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

})();
