'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, Image as ImageIcon, CheckCircle, Loader2 } from 'lucide-react'
import { useCurrencies } from '@/hooks/useCurrencies'

interface OrganizationData {
  _id: string
  name: string
  domain?: string
  logo?: string
  darkLogo?: string
  logoMode?: 'light' | 'dark' | 'both'
  timezone: string
  currency: string
  language: string
  industry?: string
  size: string
}

export default function OrganizationSettingsPage() {
  const { currencies, loading: currenciesLoading, formatCurrencyDisplay } = useCurrencies(true)
  const [organization, setOrganization] = useState<OrganizationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [darkLogoFile, setDarkLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [darkLogoPreview, setDarkLogoPreview] = useState<string>('')

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    timezone: 'UTC',
    currency: 'USD',
    language: 'en',
    industry: '',
    size: 'small',
    logoMode: 'both'
  })

  useEffect(() => {
    fetchOrganization()
  }, [])

  const fetchOrganization = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/settings/organization')
      const data = await response.json()

      if (data.success) {
        setOrganization(data.data)
        setFormData({
          name: data.data.name || '',
          domain: data.data.domain || '',
          timezone: data.data.timezone || 'UTC',
          currency: data.data.currency || 'USD',
          language: data.data.language || 'en',
          industry: data.data.industry || '',
          size: data.data.size || 'small',
          logoMode: data.data.logoMode || 'both'
        })
        setLogoPreview(data.data.logo || '')
        setDarkLogoPreview(data.data.darkLogo || '')
      } else {
        setError(data.error || 'Failed to fetch organization data')
      }
    } catch (err) {
      setError('Failed to fetch organization data')
    } finally {
      setLoading(false)
    }
  }

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDarkLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setDarkLogoFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setDarkLogoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    try {
      setSaving(true)
      
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('domain', formData.domain)
      formDataToSend.append('timezone', formData.timezone)
      formDataToSend.append('currency', formData.currency)
      formDataToSend.append('language', formData.language)
      formDataToSend.append('industry', formData.industry)
      formDataToSend.append('size', formData.size)
      formDataToSend.append('logoMode', formData.logoMode)

      if (logoFile) {
        formDataToSend.append('logo', logoFile)
      }
      if (darkLogoFile) {
        formDataToSend.append('darkLogo', darkLogoFile)
      }

      const response = await fetch('/api/settings/organization', {
        method: 'PUT',
        body: formDataToSend
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Organization settings updated successfully!')
        setTimeout(() => setSuccess(''), 3000)
        fetchOrganization()
      } else {
        setError(data.error || 'Failed to update organization settings')
      }
    } catch (err) {
      setError('Failed to update organization settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Organization Settings</h1>
          <p className="text-muted-foreground">Manage your organization's branding and settings</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="default">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Update your organization's basic details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    value={formData.domain}
                    onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                    placeholder="example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={formData.timezone} onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {currenciesLoading ? (
                        <SelectItem value="loading" disabled>Loading currencies...</SelectItem>
                      ) : (
                        currencies.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {formatCurrencyDisplay(currency)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={formData.language} onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logo Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Logo</CardTitle>
              <CardDescription>Upload your organization's logo for use in emails and branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="logoMode">Logo Mode</Label>
                <Select value={formData.logoMode} onValueChange={(value) => setFormData(prev => ({ ...prev, logoMode: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light Mode Only</SelectItem>
                    <SelectItem value="dark">Dark Mode Only</SelectItem>
                    <SelectItem value="both">Both Light & Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Light Logo */}
                <div className="space-y-4">
                  <Label>Light Mode Logo</Label>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                    {logoPreview ? (
                      <div className="space-y-4">
                        <img 
                          src={logoPreview} 
                          alt="Light logo preview" 
                          className="mx-auto h-20 w-20 object-contain"
                        />
                        <p className="text-sm text-muted-foreground">Current logo</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">No logo uploaded</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-4">
                      <Label htmlFor="logo" className="cursor-pointer">
                        <div className="flex items-center justify-center space-x-2">
                          <Upload className="h-4 w-4" />
                          <span>Upload Light Logo</span>
                        </div>
                      </Label>
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Dark Logo */}
                <div className="space-y-4">
                  <Label>Dark Mode Logo</Label>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                    {darkLogoPreview ? (
                      <div className="space-y-4">
                        <img 
                          src={darkLogoPreview} 
                          alt="Dark logo preview" 
                          className="mx-auto h-20 w-20 object-contain"
                        />
                        <p className="text-sm text-muted-foreground">Current dark logo</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">No dark logo uploaded</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-4">
                      <Label htmlFor="darkLogo" className="cursor-pointer">
                        <div className="flex items-center justify-center space-x-2">
                          <Upload className="h-4 w-4" />
                          <span>Upload Dark Logo</span>
                        </div>
                      </Label>
                      <Input
                        id="darkLogo"
                        type="file"
                        accept="image/*"
                        onChange={handleDarkLogoUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  )
}
