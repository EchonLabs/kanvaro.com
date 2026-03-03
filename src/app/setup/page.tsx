'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Database, User, Building, Mail, CheckCircle, BookOpen } from 'lucide-react'
import { ProgressSteps } from '@/components/setup/ProgressSteps'
import { DatabaseConfig } from '@/components/setup/DatabaseConfig'
import { AdminUserSetup } from '@/components/setup/AdminUserSetup'
import { OrganizationSetup } from '@/components/setup/OrganizationSetup'
import { EmailConfig } from '@/components/setup/EmailConfig'
import { SetupComplete } from '@/components/setup/SetupComplete'
import { Button } from '@/components/ui/Button'

const setupSteps = [
  { id: 'database', title: 'Database', icon: Database },
  { id: 'admin', title: 'Admin Account', icon: User },
  { id: 'organization', title: 'Organization', icon: Building },
  { id: 'email', title: 'Email Settings', icon: Mail },
  { id: 'complete', title: 'Finish Setup', icon: CheckCircle },
]

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState('database')
  const [setupData, setSetupData] = useState<any>({})
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleNext = (stepData: any) => {
    // Extract existing data from database step if present
    if (stepData.existingData) {
      const { existingData, ...otherData } = stepData
      console.log('Pre-filling setup data with existing data:', existingData)
      setSetupData({ 
        ...setupData, 
        ...otherData,
        // Pre-fill subsequent steps with existing data
        admin: existingData.adminUser || setupData.admin,
        organization: existingData.organization || setupData.organization,
        email: existingData.emailConfig || setupData.email
      })
    } else {
      setSetupData({ ...setupData, ...stepData })
    }
    
    const stepIndex = setupSteps.findIndex(step => step.id === currentStep)
    if (stepIndex < setupSteps.length - 1) {
      setCurrentStep(setupSteps[stepIndex + 1].id)
    }
  }

  const handleBack = () => {
    const stepIndex = setupSteps.findIndex(step => step.id === currentStep)
    if (stepIndex > 0) {
      setCurrentStep(setupSteps[stepIndex - 1].id)
    }
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Setup completed successfully, redirect to login page
          router.push('/login?message=setup-completed')
        } else {
          throw new Error(result.error || 'Setup completion failed')
        }
      } else {
        const errorData = await response.json()
        console.error('Setup completion API error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Setup completion failed')
      }
    } catch (error) {
      console.error('Setup completion error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Setup completion failed: ${errorMessage}\n\nPlease check the browser console for more details.`)
    } finally {
      setIsLoading(false)
    }
  }


  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'database':
        return <DatabaseConfig onNext={handleNext} initialData={setupData.database} />
      case 'admin':
        return <AdminUserSetup onNext={handleNext} onBack={handleBack} initialData={setupData.admin} />
      case 'organization':
        return <OrganizationSetup onNext={handleNext} onBack={handleBack} initialData={setupData.organization} />
      case 'email':
        return <EmailConfig onNext={handleNext} onBack={handleBack} initialData={setupData.email} />
      case 'complete':
        return <SetupComplete onComplete={handleComplete} onBack={handleBack} setupData={setupData} isLoading={isLoading} />
      default:
        return <DatabaseConfig onNext={handleNext} initialData={setupData.database} />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {/* Mobile Header */}
          <div className="block md:hidden mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              Welcome to Kanvaro
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              Let's configure your Kanvaro instance with a few simple steps.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/docs/public')}
              className="flex items-center space-x-2 w-full sm:w-auto"
            >
              <BookOpen className="h-4 w-4" />
              <span>Check our Documentation</span>
            </Button>
          </div>

          {/* Main Content Layout */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Desktop Sidebar - Progress Steps */}
            <div className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-8">
                {/* Header Section - Left Aligned */}
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    Welcome to Kanvaro
                  </h1>
                  <p className="text-sm text-muted-foreground mb-4">
                    Let's configure your Kanvaro instance with a few simple steps. 
                    This will only take a few minutes.
                  </p>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/docs/public')}
                      className="flex items-center space-x-2"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>Check our Documentation</span>
                    </Button>
                  </div>
                </div>
                
                {/* Progress Steps */}
                <ProgressSteps 
                  steps={setupSteps} 
                  currentStep={currentStep}
                />
              </div>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 min-w-0">
              {/* Mobile Progress Steps */}
              <div className="block lg:hidden mb-6">
                <ProgressSteps 
                  steps={setupSteps} 
                  currentStep={currentStep}
                />
              </div>
              
              {renderCurrentStep()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
