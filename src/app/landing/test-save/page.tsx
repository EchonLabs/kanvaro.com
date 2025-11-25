'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export default function TestSavePage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

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

  const handleSave = async () => {
    setLoading(true)
    setResult(null)
    try {
      console.log('Saving images...', cloudinaryImages)
      const response = await fetch('/api/landing-page/images', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudinaryImages)
      })

      const data = await response.json()
      console.log('Response:', response.status, data)
      setResult({ status: response.status, data })
      
      if (response.ok) {
        alert('✅ Images saved! Check console for details.')
      } else {
        alert(`❌ Error: ${data.error || 'Failed to save'}`)
      }
    } catch (error: any) {
      console.error('Error:', error)
      setResult({ error: error.message })
      alert(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFetch = async () => {
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/landing-page/images')
      const data = await response.json()
      console.log('Fetched images:', data)
      setResult({ status: response.status, data })
    } catch (error: any) {
      console.error('Error:', error)
      setResult({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Test Landing Page Images</h1>
        
        <div className="space-y-4 mb-6">
          <Button onClick={handleSave} disabled={loading} className="bg-green-600 hover:bg-green-700">
            {loading ? 'Saving...' : 'Save Images to Database'}
          </Button>
          <Button onClick={handleFetch} disabled={loading} variant="outline">
            {loading ? 'Loading...' : 'Fetch Images from Database'}
          </Button>
        </div>

        {result && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-3">Result:</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
