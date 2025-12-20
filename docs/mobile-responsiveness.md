---
slug: "concepts/mobile-responsiveness"
title: "Mobile Responsiveness"
summary: "Mobile-first responsive design approach with touch-friendly interfaces, adaptive layouts, and progressive web app features."
visibility: "public"
audiences: ["admin", "project_manager", "team_member", "self_host_admin"]
category: "concepts"
order: 70
updated: "2025-01-04"
---

# Kanvaro - Mobile Responsiveness & Adaptive Design

## Overview

Kanvaro is built with a mobile-first approach using [shadcn/ui](https://ui.shadcn.com/) components that are inherently responsive. The application adapts seamlessly to any screen size, from mobile phones to large desktop displays, ensuring optimal user experience across all devices.

## Mobile-First Design Strategy

### Responsive Breakpoints
```typescript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'xs': '475px',   // Extra small devices
      'sm': '640px',   // Small devices (phones)
      'md': '768px',   // Medium devices (tablets)
      'lg': '1024px',  // Large devices (laptops)
      'xl': '1280px',  // Extra large devices (desktops)
      '2xl': '1536px', // 2X large devices (large desktops)
    }
  }
}
```

### shadcn/ui Responsive Components

#### Responsive Navigation
```typescript
// components/layout/ResponsiveNavigation.tsx
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from '@/components/ui/navigation-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export const ResponsiveNavigation = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop Navigation */}
      <NavigationMenu className="hidden md:flex">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Projects</NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="grid gap-3 p-6 w-[400px]">
                <NavigationMenuLink href="/projects">
                  All Projects
                </NavigationMenuLink>
                <NavigationMenuLink href="/projects/active">
                  Active Projects
                </NavigationMenuLink>
                <NavigationMenuLink href="/projects/completed">
                  Completed Projects
                </NavigationMenuLink>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/tasks">Tasks</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/team">Team</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      {/* Mobile Navigation */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
          <div className="flex flex-col space-y-4 mt-4">
            <Button variant="ghost" className="justify-start" asChild>
              <NavigationMenuLink href="/projects">Projects</NavigationMenuLink>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <NavigationMenuLink href="/tasks">Tasks</NavigationMenuLink>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <NavigationMenuLink href="/team">Team</NavigationMenuLink>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
```

#### Responsive Dashboard Layout
```typescript
// components/dashboard/ResponsiveDashboard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const ResponsiveDashboard = () => {
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Responsive Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <Badge variant="secondary">12</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+2 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Badge variant="default">24</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">+4 from yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Badge variant="outline">8</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">+1 new member</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Badge variant="secondary">85%</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <Progress value={85} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Responsive Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 lg:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <ResponsiveProjectList />
        </TabsContent>
        
        <TabsContent value="projects" className="space-y-4">
          <ResponsiveProjectGrid />
        </TabsContent>
        
        <TabsContent value="tasks" className="space-y-4">
          <ResponsiveTaskList />
        </TabsContent>
        
        <TabsContent value="team" className="space-y-4">
          <ResponsiveTeamGrid />
        </TabsContent>
      </Tabs>
    </div>
  );
};
```

#### Responsive Project Cards
```typescript
// components/projects/ResponsiveProjectCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Calendar, Users, Clock } from 'lucide-react';

export const ResponsiveProjectCard = ({ project }) => {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <CardTitle className="text-lg font-semibold truncate">
            {project.name}
          </CardTitle>
          <Badge 
            variant={project.status === 'active' ? 'default' : 'secondary'}
            className="w-fit"
          >
            {project.status}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Project Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {project.description}
        </p>

        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </div>

        {/* Team Members */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Team</span>
          </div>
          <div className="flex -space-x-2">
            {project.team.slice(0, 3).map((member) => (
              <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                <AvatarImage src={member.avatar} />
                <AvatarFallback>{member.name[0]}</AvatarFallback>
              </Avatar>
            ))}
            {project.team.length > 3 && (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
                +{project.team.length - 3}
              </div>
            )}
          </div>
        </div>

        {/* Project Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>{project.dueDate}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>{project.estimatedHours}h</span>
            </div>
          </div>
          
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            View Project
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
```

#### Responsive Data Tables
```typescript
// components/tables/ResponsiveDataTable.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, MoreHorizontal } from 'lucide-react';

export const ResponsiveDataTable = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden lg:block">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell>
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {project.team.slice(0, 3).map((member) => (
                          <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback>{member.name[0]}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{project.progress}%</div>
                        <Progress value={project.progress} className="h-2" />
                      </div>
                    </TableCell>
                    <TableCell>{project.dueDate}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {data.map((project) => (
          <Card key={project.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                  {project.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Team Members */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Team</span>
                <div className="flex -space-x-2">
                  {project.team.slice(0, 3).map((member) => (
                    <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>{member.name[0]}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="h-2" />
              </div>

              {/* Due Date */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Due Date</span>
                <span>{project.dueDate}</span>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" className="flex-1">
                  View
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
```

## Mobile-Specific Features

### Touch Gestures
```typescript
// hooks/useTouchGestures.ts
import { useCallback, useRef } from 'react';

export const useTouchGestures = () => {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEnd.current = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };
  }, []);

  const handleSwipe = useCallback((onSwipeLeft?: () => void, onSwipeRight?: () => void) => {
    if (!touchStart.current || !touchEnd.current) return;

    const deltaX = touchEnd.current.x - touchStart.current.x;
    const deltaY = touchEnd.current.y - touchStart.current.y;

    // Horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 50 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < -50 && onSwipeLeft) {
        onSwipeLeft();
      }
    }
  }, []);

  return {
    handleTouchStart,
    handleTouchEnd,
    handleSwipe
  };
};
```

### Mobile Navigation
```typescript
// components/layout/MobileNavigation.tsx
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from '@/components/ui/navigation-menu';
import { Menu, Home, FolderOpen, Users, Settings, LogOut } from 'lucide-react';

export const MobileNavigation = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navigationItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/projects', label: 'Projects', icon: FolderOpen },
    { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/team', label: 'Team', icon: Users },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[400px]">
        <div className="flex flex-col space-y-4 mt-4">
          {navigationItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className="justify-start"
              asChild
            >
              <NavigationMenuLink href={item.href} className="flex items-center space-x-2">
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavigationMenuLink>
            </Button>
          ))}
          <div className="border-t pt-4">
            <Button variant="ghost" className="justify-start text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
```

## Responsive Typography

### Fluid Typography
```css
/* globals.css */
:root {
  --fluid-text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --fluid-text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --fluid-text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --fluid-text-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --fluid-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 2rem);
  --fluid-text-3xl: clamp(1.875rem, 1.6rem + 1.375vw, 2.5rem);
}

.fluid-text-sm { font-size: var(--fluid-text-sm); }
.fluid-text-base { font-size: var(--fluid-text-base); }
.fluid-text-lg { font-size: var(--fluid-text-lg); }
.fluid-text-xl { font-size: var(--fluid-text-xl); }
.fluid-text-2xl { font-size: var(--fluid-text-2xl); }
.fluid-text-3xl { font-size: var(--fluid-text-3xl); }
```

## Performance Optimization

### Lazy Loading
```typescript
// components/LazyComponents.tsx
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load heavy components
const ProjectChart = lazy(() => import('./ProjectChart'));
const DataTable = lazy(() => import('./DataTable'));
const Calendar = lazy(() => import('./Calendar'));

export const LazyProjectChart = () => (
  <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
    <ProjectChart />
  </Suspense>
);

export const LazyDataTable = () => (
  <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
    <DataTable />
  </Suspense>
);

export const LazyCalendar = () => (
  <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
    <Calendar />
  </Suspense>
);
```

### Responsive Images
```typescript
// components/ResponsiveImage.tsx
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export const ResponsiveImage = ({ src, alt, className, priority = false }: ResponsiveImageProps) => {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={priority}
      />
    </div>
  );
};
```

## Testing Responsive Design

### Responsive Testing Utilities
```typescript
// utils/responsive-testing.ts
export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
};

export const testResponsiveDesign = () => {
  // Test different screen sizes
  const testSizes = [
    { width: 375, height: 667, name: 'iPhone SE' },
    { width: 414, height: 896, name: 'iPhone 11' },
    { width: 768, height: 1024, name: 'iPad' },
    { width: 1024, height: 768, name: 'iPad Landscape' },
    { width: 1280, height: 720, name: 'Desktop' },
    { width: 1920, height: 1080, name: 'Large Desktop' }
  ];

  return testSizes;
};
```

---

*This mobile responsiveness guide will be updated as new responsive patterns are identified and mobile-specific features are added.*
