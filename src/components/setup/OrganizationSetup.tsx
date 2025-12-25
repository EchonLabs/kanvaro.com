'use client'

import { useState } from 'react'
import { Building, Upload, X, Users, UserCheck, Building2, Crown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { useCurrencies } from '@/hooks/useCurrencies'

interface OrganizationSetupProps {
  onNext: (data: any) => void
  onBack: () => void
  initialData?: any
}

export const OrganizationSetup = ({ onNext, onBack, initialData }: OrganizationSetupProps) => {
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    domain: initialData?.domain || '',
    timezone: initialData?.timezone || 'UTC',
    currency: initialData?.currency || 'USD',
    language: initialData?.language || 'en',
    industry: initialData?.industry || '',
    size: initialData?.size || 'small',
  })
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logoPreview || null)
  const [darkLogo, setDarkLogo] = useState<File | null>(null)
  const [darkLogoPreview, setDarkLogoPreview] = useState<string | null>(initialData?.darkLogoPreview || null)
  const [logoMode, setLogoMode] = useState<'light' | 'dark' | 'both'>(
    initialData?.logoMode === 'single' ? 'light' : 
    initialData?.logoMode === 'dual' ? 'both' : 
    initialData?.logoMode || 'both'
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const timezones = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
    'Asia/Kolkata', 'Australia/Sydney'
  ]

  // Currencies are now loaded from database via useCurrencies hook

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' }
  ]

  const industries = [
    'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
    'Retail', 'Consulting', 'Real Estate', 'Media', 'Non-profit', 'Other'
  ]

  const organizationSizes = [
    { value: 'startup', label: 'Startup (1-10 employees)' },
    { value: 'small', label: 'Small (11-50 employees)' },
    { value: 'medium', label: 'Medium (51-200 employees)' },
    { value: 'enterprise', label: 'Enterprise (200+ employees)' }
  ]

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'light' | 'dark') => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('File size must be less than 5MB')
        return
      }
      
      if (type === 'light') {
        setLogo(file)
        const reader = new FileReader()
        reader.onload = (e) => {
          setLogoPreview(e.target?.result as string)
        }
        reader.readAsDataURL(file)
      } else {
        setDarkLogo(file)
        const reader = new FileReader()
        reader.onload = (e) => {
          setDarkLogoPreview(e.target?.result as string)
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const removeLogo = (type: 'light' | 'dark') => {
    if (type === 'light') {
      setLogo(null)
      setLogoPreview(null)
    } else {
      setDarkLogo(null)
      setDarkLogoPreview(null)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required'
    }

    if (formData.domain) {
      // Allow both plain domains (example.com) and full URLs (https://example.com)
      const domainRegex = /^(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/
      if (!domainRegex.test(formData.domain)) {
        newErrors.domain = 'Please enter a valid domain name or URL'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      onNext({ 
        organization: {
          ...formData,
          logo: logoPreview,
          darkLogo: darkLogoPreview,
          logoMode
        }
      })
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start space-x-4 mb-8">
        <div className="flex-shrink-0">
          <Building className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2">Organization Setup</h2>
          <p className="text-muted-foreground">
            Configure your organization details and preferences
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Your Company Name"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Website Domain (Optional)</Label>
            <Input
              id="domain"
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="yourcompany.com or https://yourcompany.com"
              className={errors.domain ? 'border-red-500' : ''}
            />
            <p className="text-xs text-muted-foreground">
              Enter your website domain or full URL (e.g., example.com or https://example.com)
            </p>
            {errors.domain && (
              <p className="text-sm text-red-600">{errors.domain}</p>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Organization Logo</Label>
              <p className="text-sm text-muted-foreground">
                Configure your organization logo for the best display across all themes
              </p>
            </div>

            {/* Logo Mode Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                  logoMode === 'light'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setLogoMode('light')}
              >
                <div className="text-center">
                  <div className="h-12 w-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Single Logo</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload one logo that will be used across all themes and interfaces
                  </p>
                </div>
              </div>

              <div
                className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                  logoMode === 'both'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setLogoMode('both')}
              >
                <div className="text-center">
                  <div className="h-12 w-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center">
                    <div className="flex space-x-1">
                      <div className="h-4 w-4 bg-white border border-gray-300 rounded"></div>
                      <div className="h-4 w-4 bg-gray-800 border border-gray-600 rounded"></div>
                    </div>
                  </div>
                  <h3 className="font-semibold">Dual Logos</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload separate logos for light and dark themes to ensure optimal visibility
                  </p>
                </div>
              </div>
            </div>

            {logoMode === 'light' ? (
              <div className="bg-card border rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  {logoPreview ? (
                    <div className="relative">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-20 w-20 object-contain rounded-lg border bg-background"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeLogo('light')}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Label htmlFor="logo" className="text-sm font-medium text-foreground">
                      Organization Logo
                    </Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Upload a logo that works well in both light and dark themes
                    </p>
                    <input
                      type="file"
                      id="logo"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'light')}
                      className="hidden"
                    />
                    <Label
                      htmlFor="logo"
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground bg-background hover:bg-accent transition-colors"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </Label>
                    <p className="text-xs text-muted-foreground mt-2">Max 5MB, PNG/JPG/SVG</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Light Mode Logo */}
                <div className="bg-card border rounded-lg p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
                    <Label className="text-sm font-medium text-foreground">Light Mode Logo</Label>
                  </div>
                  <div className="flex items-center space-x-4">
                    {logoPreview ? (
                      <div className="relative">
                        <img
                          src={logoPreview}
                          alt="Light logo preview"
                          className="h-20 w-20 object-contain rounded-lg border bg-white"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeLogo('light')}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="h-20 w-20 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center bg-white">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-2">
                        Optimized for light backgrounds
                      </p>
                      <input
                        type="file"
                        id="light-logo"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(e, 'light')}
                        className="hidden"
                      />
                      <Label
                        htmlFor="light-logo"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground bg-background hover:bg-accent transition-colors"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Dark Mode Logo */}
                <div className="bg-card border rounded-lg p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-4 h-4 bg-gray-800 border border-gray-600 rounded"></div>
                    <Label className="text-sm font-medium text-foreground">Dark Mode Logo</Label>
                  </div>
                  <div className="flex items-center space-x-4">
                    {darkLogoPreview ? (
                      <div className="relative">
                        <img
                          src={darkLogoPreview}
                          alt="Dark logo preview"
                          className="h-20 w-20 object-contain rounded-lg border bg-gray-800"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeLogo('dark')}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="h-20 w-20 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center bg-gray-800">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-2">
                        Optimized for dark backgrounds
                      </p>
                      <input
                        type="file"
                        id="dark-logo"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(e, 'dark')}
                        className="hidden"
                      />
                      <Label
                        htmlFor="dark-logo"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground bg-background hover:bg-accent transition-colors"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={formData.timezone || undefined} onValueChange={(value) => setFormData({ ...formData, timezone: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={formData.currency || undefined} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {currenciesLoading ? (
                    <SelectItem value="loading" disabled>Loading currencies...</SelectItem>
                  ) : (
                    currencies.map((currency, index) => (
                      <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                        {formatCurrencyDisplay(currency)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={formData.language || undefined} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={formData.industry || undefined} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Size</Label>
              <p className="text-sm text-muted-foreground">
                Choose the size category that best represents your organization
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {organizationSizes.map((size) => {
                const getIcon = () => {
                  switch (size.value) {
                    case 'startup': return Users
                    case 'small': return UserCheck
                    case 'medium': return Building2
                    case 'enterprise': return Crown
                    default: return Users
                  }
                }
                const Icon = getIcon()
                
                return (
                  <div
                    key={size.value}
                    className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                      formData.size === size.value
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setFormData({ ...formData, size: size.value })}
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                        formData.size === size.value
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted/50 text-muted-foreground'
                      }`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            formData.size === size.value
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/30'
                          }`}>
                            {formData.size === size.value && (
                              <div className="h-2 w-2 rounded-full bg-white"></div>
                            )}
                          </div>
                          <div className="font-semibold text-foreground">{size.label}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {size.value === 'startup' && 'Small teams and early-stage companies'}
                          {size.value === 'small' && 'Growing businesses with established teams'}
                          {size.value === 'medium' && 'Established companies with multiple departments'}
                          {size.value === 'enterprise' && 'Large organizations with complex structures'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
            >
              Back
            </Button>
            <Button
              type="submit"
            >
              Next Step
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
