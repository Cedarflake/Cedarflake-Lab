/** @param {Element} element */
export function observeStoppedSpeed(element) {
  const initialText = element.textContent?.trim()
  const initialSpeed = Number(initialText)
  if (!initialText || !Number.isFinite(initialSpeed) || initialSpeed < 1) {
    throw new Error(`Expected a moving car before observing its stop, got "${initialText}"`)
  }
  const observation = {
    hasStopped: false,
    disconnect: () => observer.disconnect(),
  }
  const observe = () => {
    const text = element.textContent?.trim()
    const speed = Number(text)
    if (text && Number.isFinite(speed) && speed >= 0 && speed < 1) {
      observation.hasStopped = true
      observer.disconnect()
    }
  }
  const observer = new MutationObserver(observe)
  observer.observe(element, { childList: true, characterData: true, subtree: true })
  observe()
  return observation
}
