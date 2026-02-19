/**
 * Svelte action: fires `action` immediately on mousedown, then repeats
 * with accelerating speed while the button is held.
 *
 * Usage:  <button use:holdRepeat={() => count--} disabled={count <= 0}>−</button>
 *
 * Replaces onclick — do not combine with onclick on the same element.
 */
export function holdRepeat(node, action) {
    const INITIAL_DELAY   = 400;  // ms before repeating starts
    const INITIAL_INTERVAL = 150; // ms between first repeats
    const MIN_INTERVAL    = 40;   // ms floor (≈25 per second)
    const ACCEL           = 0.80; // interval multiplied by this each step

    let timeoutId = null;
    let repeatId  = null;

    function fire() {
        if (!node.disabled) action();
    }

    function stop() {
        clearTimeout(timeoutId);
        clearTimeout(repeatId);
        timeoutId = null;
        repeatId  = null;
    }

    function scheduleRepeat(interval) {
        repeatId = setTimeout(() => {
            if (node.disabled) { stop(); return; }
            action();
            scheduleRepeat(Math.max(MIN_INTERVAL, interval * ACCEL));
        }, interval);
    }

    function onMouseDown(e) {
        if (e.button !== 0 || node.disabled) return;
        fire();
        timeoutId = setTimeout(() => scheduleRepeat(INITIAL_INTERVAL), INITIAL_DELAY);
    }

    // Keyboard: fire once on keydown (browser auto-repeats for held keys)
    function onKeyDown(e) {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            fire();
        }
    }

    node.addEventListener('mousedown', onMouseDown);
    node.addEventListener('mouseup',   stop);
    node.addEventListener('mouseleave', stop);
    node.addEventListener('keydown',   onKeyDown);

    return {
        update(newAction) { action = newAction; },
        destroy() {
            stop();
            node.removeEventListener('mousedown', onMouseDown);
            node.removeEventListener('mouseup',   stop);
            node.removeEventListener('mouseleave', stop);
            node.removeEventListener('keydown',   onKeyDown);
        },
    };
}
