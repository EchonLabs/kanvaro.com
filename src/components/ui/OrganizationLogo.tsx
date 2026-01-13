'use client'

import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'

interface OrganizationLogoProps {
  lightLogo?: string
  darkLogo?: string
  logoMode?: 'light' | 'dark' | 'both' | 'auto'
  fallbackText?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const OrganizationLogo = ({ 
  lightLogo, 
  darkLogo, 
  logoMode = 'both',
  fallbackText = 'K', 
  className = '',
  size = 'md'
}: OrganizationLogoProps) => {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={`flex items-center justify-center bg-primary/10 text-primary font-bold ${className}`}>
        {fallbackText}
      </div>
    )
  }

  const currentTheme = resolvedTheme || theme
  
  // Debug logging removed to prevent unnecessary re-renders
  
  // Determine which logo to use based on logoMode and current theme
  let logoSrc: string | undefined
  
  if (logoMode === 'light') {
    // Force light logo regardless of theme
    logoSrc = lightLogo
  } else if (logoMode === 'dark') {
    // Force dark logo regardless of theme
    logoSrc = darkLogo
  } else if (logoMode === 'auto') {
    // Auto mode: choose logo based on current theme
    if (currentTheme === 'dark') {
      logoSrc = darkLogo || lightLogo // Fallback to light logo if dark logo not available
    } else {
      logoSrc = lightLogo || darkLogo // Fallback to dark logo if light logo not available
    }
  } else { // logoMode === 'both' or undefined
    // Choose logo based on current theme
    if (currentTheme === 'dark') {
      logoSrc = darkLogo || lightLogo // Fallback to light logo if dark logo not available
    } else {
      logoSrc = lightLogo || darkLogo // Fallback to dark logo if light logo not available
    }
  }

  // If we only have one logo and it's a base64 data URL, use it for both themes
  // This handles the case where the database only has one logo
  if (!logoSrc && (lightLogo || darkLogo)) {
    logoSrc = lightLogo || darkLogo
  }

  const sizeClasses = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-12 w-12 text-lg',
    lg: 'h-16 w-16 text-xl'
  }

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt="Organization logo"
        className={`object-contain ${sizeClasses[size]} ${className}`}
      />
    )
  }

  return (
    <div className={`flex items-center justify-center bg-primary/10 text-primary font-bold rounded ${sizeClasses[size]} ${className}`}>
      {fallbackText}
    </div>
  )
}
