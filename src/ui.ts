/** Shared client-only behavior for the local and online match shells. */
export function initMatchUI() {
  const panel = document.getElementById('sidebar')!
  const handle = document.getElementById('panel-handle')!
  const workspace = document.querySelector<HTMLElement>('.workspace')!
  const mobile = matchMedia('(max-width: 1000px)')
  const resetPosition = () => {
    panel.style.removeProperty('left')
    panel.style.removeProperty('top')
    panel.style.removeProperty('right')
    if (!mobile.matches) {
      panel.classList.remove('mobile-open')
      handle.setAttribute('aria-expanded', 'false')
    }
  }
  window.addEventListener('resize', resetPosition)
  handle.addEventListener('click', () => {
    if (!mobile.matches) return
    handle.setAttribute('aria-expanded', String(panel.classList.toggle('mobile-open')))
  })
  handle.addEventListener('pointerdown', event => {
    if (mobile.matches) return
    const rect = panel.getBoundingClientRect()
    const area = workspace.getBoundingClientRect()
    const dx = event.clientX - rect.left, dy = event.clientY - rect.top
    handle.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      panel.style.left = `${Math.max(0, Math.min(area.width - rect.width, e.clientX - area.left - dx))}px`
      panel.style.top = `${Math.max(0, Math.min(area.height - rect.height, e.clientY - area.top - dy))}px`
      panel.style.right = 'auto'
    }
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('lostpointercapture', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', stop)
  })
  const menu = document.querySelector<HTMLDetailsElement>('.match-menu')
  if (menu) {
    document.addEventListener('click', event => {
      if (!menu.contains(event.target as Node) || (event.target as Element).closest('button')) menu.open = false
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false
        menu.querySelector('summary')?.focus()
      }
    })
  }
}
