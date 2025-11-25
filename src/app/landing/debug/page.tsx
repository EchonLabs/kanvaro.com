'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

export default function LandingPageDebug() {
  const [images, setImages] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cloudinaryImages = {
    heroDashboard: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044927/EL-Core-Assets/Static/Kanvaro/he_1_xqkbdw.png",
    showcaseImages: {
      tasks: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/2_ocdtse.png",
      projects: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044930/EL-Core-Assets/Static/Kanvaro/6_n6p2bu.png",
      members: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/5_1_dpjhwk.png",
      timeLogs: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/4_jwnslu.png",
      reports: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
    },
    stepImages: {
      step1: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/3_1_benfd7.png",
      step2: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044928/EL-Core-Assets/Static/Kanvaro/7_a8ky5x.png",
      step3: "https://res.cloudinary.com/dichgutd0/image/upload/v1764044929/EL-Core-Assets/Static/Kanvaro/1_qpvyfp.png"
    }
  }

  useEffect(() => {
    fetchImages()
  }, [])

  const fetchImages = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/landing-page/images')
      if (response.ok) {
        const data = await response.json()
        console.log('Current images:', data)
        setImages(data)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(`Failed to fetch: ${response.status} - ${errorData.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching images:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveImages = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/landing-page/images', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudinaryImages)
      })

      const data = await response.json()
      
      if (response.ok) {
        console.log('Images saved successfully:', data)
        alert('✅ Images saved successfully! Refresh the page to see them.')
        await fetchImages()
      } else {
        setError(`Failed to save: ${response.status} - ${data.error || 'Unknown error'}`)
        console.error('Error saving images:', data)
      }
    } catch (err: any) {
      setError(err.message)
      console.error('Error saving images:', err)
    } finally {
      setSaving(false)
    }
  }

  const testImage = (url: string) => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = url
      setTimeout(() => resolve(false), 5000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Landing Page Images Debug</h1>

        <div className="space-y-4 mb-6">
          <div className="flex gap-4">
            <Button onClick={fetchImages} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh Images'}
            </Button>
            <Button onClick={saveImages} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? 'Saving...' : 'Save Cloudinary Images'}
            </Button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">Current Images in Database</h2>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="space-y-2 font-mono text-sm">
                <div>
                  <strong>Hero:</strong> {images?.heroDashboard ? (
                    <span className="text-green-600">✓ Set</span>
                  ) : (
                    <span className="text-red-600">✗ Not set</span>
                  )}
                </div>
                <div>
                  <strong>Steps:</strong>
                  <ul className="ml-4">
                    <li>Step 1: {images?.stepImages?.step1 ? '✓' : '✗'}</li>
                    <li>Step 2: {images?.stepImages?.step2 ? '✓' : '✗'}</li>
                    <li>Step 3: {images?.stepImages?.step3 ? '✓' : '✗'}</li>
                  </ul>
                </div>
                <div>
                  <strong>Showcases:</strong>
                  <ul className="ml-4">
                    <li>Tasks: {images?.showcaseImages?.tasks ? '✓' : '✗'}</li>
                    <li>Projects: {images?.showcaseImages?.projects ? '✓' : '✗'}</li>
                    <li>Members: {images?.showcaseImages?.members ? '✓' : '✗'}</li>
                    <li>Time Logs: {images?.showcaseImages?.timeLogs ? '✓' : '✗'}</li>
                    <li>Reports: {images?.showcaseImages?.reports ? '✓' : '✗'}</li>
                  </ul>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Image Preview Test</h2>
            {images?.heroDashboard && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Hero Image:</p>
                <img 
                  src={images.heroDashboard} 
                  alt="Hero" 
                  className="max-w-full h-auto border rounded"
                  onError={(e) => {
                    console.error('Image failed to load:', images.heroDashboard)
                    e.currentTarget.style.border = '2px solid red'
                  }}
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">API Response</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs">
              {JSON.stringify(images, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
