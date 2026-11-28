import { GitFork, Menu, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react"

import { siteConfig } from "../config/site"

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 760px)")

    function closeOnDesktop() {
      if (!mobileViewport.matches) {
        if (document.activeElement === menuButtonRef.current) {
          headerRef.current?.querySelector<HTMLAnchorElement>(".mini-brand")?.focus()
        }
        setIsMenuOpen(false)
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        if (headerRef.current?.contains(document.activeElement)) {
          menuButtonRef.current?.focus({ preventScroll: true })
        }
        setIsMenuOpen(false)
      }
    }

    mobileViewport.addEventListener("change", closeOnDesktop)
    if (isMenuOpen) {
      document.addEventListener("pointerdown", closeOnOutsidePointer)
    }

    return () => {
      mobileViewport.removeEventListener("change", closeOnDesktop)
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
    }
  }, [isMenuOpen])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && isMenuOpen) {
      event.preventDefault()
      setIsMenuOpen(false)
      menuButtonRef.current?.focus()
    }
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsMenuOpen(false)
    }
  }

  function handleNavigate(event: MouseEvent<HTMLAnchorElement>) {
    if (!isMenuOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    setIsMenuOpen(false)
    const targetId = event.currentTarget.hash.slice(1)
    const focusTarget = targetId ? document.getElementById(targetId) : menuButtonRef.current
    if (focusTarget?.hasAttribute("data-reveal")) {
      focusTarget.dataset["revealState"] = "visible"
    }
    focusTarget?.focus({ preventScroll: true })
  }

  return (
    <header
      className="site-header"
      data-reveal
      ref={headerRef}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <a
        className="mini-brand"
        href="#top"
        aria-label={siteConfig.header.homeLabel}
        onClick={handleNavigate}
      >
        <img src="/favicon.png" width="32" height="32" alt="" />
        <span>{siteConfig.header.brand}</span>
        <span>{siteConfig.header.edition}</span>
      </a>
      <button
        className="site-menu-toggle"
        type="button"
        ref={menuButtonRef}
        aria-expanded={isMenuOpen}
        aria-controls="site-header-links"
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
      >
        <span>{isMenuOpen ? siteConfig.header.closeMenuLabel : siteConfig.header.menuLabel}</span>
        {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      <div className="site-header__links" id="site-header-links" data-open={isMenuOpen}>
        <nav aria-label="Primary navigation">
          {siteConfig.navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={handleNavigate}>
              {item.label}
            </a>
          ))}
        </nav>
        <a
          className="github-link"
          href={siteConfig.repositoryUrl}
          rel="noreferrer"
          target="_blank"
          onClick={handleNavigate}
        >
          <GitFork aria-hidden="true" />
          <span>{siteConfig.header.sourceLabel}</span>
        </a>
      </div>
    </header>
  )
}
