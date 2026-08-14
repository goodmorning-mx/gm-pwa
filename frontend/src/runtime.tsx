import { useCallback, useEffect, useRef, useState } from 'react'

export interface PwaConfig { appName: string; version: string; serviceWorkerUrl?: string; updateIntervalMs?: number }
export interface PwaInstallState { installed: boolean; installReady: boolean; guideOpen: boolean; install: () => Promise<void>; closeGuide: () => void }
export interface PwaUpdateState { updateReady: boolean; updating: boolean; update: () => Promise<void> }

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
const ios = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function usePwaInstall(): PwaInstallState {
  const promptRef = useRef<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(standalone)
  const [installReady, setInstallReady] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); promptRef.current = event as InstallPrompt; setInstallReady(true) }
    const onInstalled = () => { promptRef.current = null; setInstallReady(false); setInstalled(true); setGuideOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  const install = useCallback(async () => {
    if (ios() || !promptRef.current) { setGuideOpen(true); return }
    const prompt = promptRef.current; await prompt.prompt(); await prompt.userChoice; promptRef.current = null; setInstallReady(false)
  }, [])
  return { installed, installReady, guideOpen, install, closeGuide: () => setGuideOpen(false) }
}

export function usePwaUpdate(config: Pick<PwaConfig, 'serviceWorkerUrl' | 'version' | 'updateIntervalMs'>): PwaUpdateState {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const reloadedRef = useRef(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updating, setUpdating] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onControllerChange = () => { if (!reloadedRef.current) { reloadedRef.current = true; window.location.reload() } }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(config.serviceWorkerUrl || '/sw.js')
        registrationRef.current = registration
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true)
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', () => { if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true) })
        })
        await registration.update()
      } catch (error) { console.warn('No se pudo registrar la PWA', error) }
    }
    void register()
    const timer = window.setInterval(() => { void registrationRef.current?.update() }, config.updateIntervalMs || 60 * 60 * 1000)
    return () => { window.clearInterval(timer); navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange) }
  }, [config.serviceWorkerUrl, config.updateIntervalMs])
  const update = useCallback(async () => {
    const registration = registrationRef.current; setUpdating(true)
    if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    else await registration?.update()
    if (!registration?.waiting) { setUpdating(false); setUpdateReady(false) }
  }, [])
  return { updateReady, updating, update }
}

export function PwaRuntime({ config, children }: { config: PwaConfig; children: React.ReactNode }) {
  const install = usePwaInstall(); const update = usePwaUpdate(config)
  if (install.installed && !update.updateReady) return <>{children}</>
  return <>
    {children}
    <div className="gm-pwa-actions" aria-live="polite">
      {update.updateReady ? <button className="gm-pwa-button gm-pwa-update" type="button" onClick={() => void update.update()} disabled={update.updating}>{update.updating ? 'Actualizando…' : 'Nueva versión disponible · Actualizar'}</button> : <button className="gm-pwa-button" type="button" onClick={() => void install.install()}>{install.installReady ? `Instalar ${config.appName}` : 'Cómo instalar esta app'}</button>}
    </div>
    {install.guideOpen && <div className="gm-pwa-backdrop" role="presentation" onClick={install.closeGuide}><section className="gm-pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="gm-pwa-title" onClick={event => event.stopPropagation()}><button className="gm-pwa-close" type="button" aria-label="Cerrar instrucciones" onClick={install.closeGuide}>×</button><h2 id="gm-pwa-title">Instalar {config.appName}</h2><ol>{ios() ? <><li>Abre esta página en Safari.</li><li>Presiona Compartir.</li><li>Selecciona “Añadir a pantalla de inicio”.</li></> : <><li>Abre el menú de tu navegador.</li><li>Selecciona “Instalar aplicación” o “Agregar a pantalla de inicio”.</li></>}</ol></section></div>}
  </>
}
