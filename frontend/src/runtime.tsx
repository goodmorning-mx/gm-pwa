import { useCallback, useEffect, useRef, useState } from 'react'

export interface PwaConfig { appName: string; version: string; serviceWorkerUrl?: string; updateIntervalMs?: number }
export interface PwaInstallState { installed: boolean; installReady: boolean; guideOpen: boolean; install: () => Promise<void>; closeGuide: () => void }
export interface PwaUpdateState { updateReady: boolean; updating: boolean; update: () => Promise<void> }
export interface PwaStatusState { online: boolean }

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

export function usePwaStatus(): PwaStatusState {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])
  return { online }
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

export function PwaStatus() {
  const { online } = usePwaStatus()
  return <span className={`gm-pwa-status gm-pwa-status-${online ? 'online' : 'offline'}`} role="status" aria-live="polite">{online ? 'En línea' : 'Sin conexión · modo offline'}</span>
}

export function PwaInstallPrompt({ appName }: { appName: string }) {
  const install = usePwaInstall()
  if (install.installed) return null
  return <button className="gm-pwa-button" type="button" onClick={() => void install.install()}>{install.installReady ? `Instalar ${appName}` : 'Cómo instalar esta app'}</button>
}

export function PwaUpdatePrompt({ config }: { config: Pick<PwaConfig, 'serviceWorkerUrl' | 'version' | 'updateIntervalMs'> }) {
  const update = usePwaUpdate(config)
  if (!update.updateReady) return null
  return <button className="gm-pwa-button gm-pwa-update" type="button" onClick={() => void update.update()} disabled={update.updating}>{update.updating ? 'Actualizando…' : 'Nueva versión disponible · Actualizar'}</button>
}

export function PwaRuntime({ config, children }: { config: PwaConfig; children: React.ReactNode }) {
  const update = usePwaUpdate(config)
  return <>
    {children}
    {update.updateReady && <div className="gm-pwa-actions" data-pwa-version={config.version} aria-live="polite">
      <button className="gm-pwa-button gm-pwa-update" type="button" onClick={() => void update.update()} disabled={update.updating}>{update.updating ? 'Actualizando…' : 'Nueva versión disponible · Actualizar'}</button>
    </div>}
  </>
}
