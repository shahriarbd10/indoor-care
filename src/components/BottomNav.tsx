"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Scan",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 7a3 3 0 0 1 3-3h3v2H7a1 1 0 0 0-1 1v3H4V7Zm10-3h3a3 3 0 0 1 3 3v3h-2V7a1 1 0 0 0-1-1h-3V4ZM4 14h2v3a1 1 0 0 0 1 1h3v2H7a3 3 0 0 1-3-3v-3Zm14 0h2v3a3 3 0 0 1-3 3h-3v-2h3a1 1 0 0 0 1-1v-3Zm-6-4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      </svg>
    ),
  },
  {
    href: "/library",
    label: "Library",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 4h10a2 2 0 0 1 2 2v12h1a1 1 0 1 1 0 2H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm1 12a1 1 0 0 0 1 1h8V6H6v10Zm3-8h4a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Zm0 4h4a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Z" />
      </svg>
    ),
  },
  {
    href: "/care",
    label: "Care",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M13.5 2.5c3 2.1 4.5 4.7 4.5 7.6 0 4.1-2.8 7.4-6.8 8.6-2.8.8-4.9 2.8-5.7 5.3-.2.7-1.2.7-1.4 0-.9-3.2-.2-6.4 2.2-8.7C8.7 13 13.3 11.8 13.3 7.7c0-1.3-.3-2.8-.8-4.2-.2-.6.4-1.2 1-1Zm7.8 10.2a.8.8 0 0 1 1.1 1.1l-2.6 2.6 1.7 1.7a.8.8 0 0 1-1.1 1.1l-1.7-1.7-2.6 2.6a.8.8 0 1 1-1.1-1.1l2.6-2.6-1.7-1.7a.8.8 0 0 1 1.1-1.1l1.7 1.7 2.6-2.6Z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M10.3 2h3.4l.4 2.2a7.8 7.8 0 0 1 2 .8l1.9-1.1 2.4 2.4-1.1 1.9c.3.6.6 1.3.8 2l2.2.4v3.4l-2.2.4a7.8 7.8 0 0 1-.8 2l1.1 1.9-2.4 2.4-1.9-1.1c-.6.3-1.3.6-2 .8L13.7 22h-3.4l-.4-2.2a7.8 7.8 0 0 1-2-.8l-1.9 1.1-2.4-2.4 1.1-1.9a7.8 7.8 0 0 1-.8-2L2 13.7v-3.4l2.2-.4c.2-.7.5-1.4.8-2L3.9 6 6.3 3.6l1.9 1.1c.6-.3 1.3-.6 2-.8L10.3 2Zm1.7 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            className={`bottom-nav-item ${isActive ? "is-active" : ""}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
