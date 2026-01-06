---
slug: "concepts/application-layout"
title: "Application Layout & UX Design"
summary: "Modern responsive application layout with collapsible sidebar navigation, comprehensive header with global search, and adaptive main content area."
visibility: "public"
audiences: ["admin", "project_manager", "team_member", "self_host_admin"]
category: "concepts"
order: 50
updated: "2025-01-04"
---

# Kanvaro - Application Layout & UX Design

## Overview

Kanvaro implements a modern, responsive application layout with a collapsible sidebar navigation, comprehensive header with global search, and adaptive main content area. The design prioritizes user experience with persistent preferences and seamless navigation.

## Layout Architecture

### Application Structure
```
┌─────────────────────────────────────────────────────────┐
│                    Header Bar                           │
│  [Logo] [Search] [Notifications] [Profile] [Theme]    │
├─────────────────────────────────────────────────────────┤
│ Sidebar │              Main Content Area               │
│ [Nav]   │  ┌─────────────────────────────────────────┐  │
│ [Items] │  │                                         │  │
│ [Collapse]│ │        Dynamic Content Panels         │  │
│         │  │                                         │  │
│         │  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Sidebar Navigation

### Navigation Structure
```typescript
// lib/navigation/navigation-config.ts
export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  permission?: string;
  children?: NavigationItem[];
  badge?: number;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    path: '/dashboard',
    permission: 'dashboard:read'
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: 'FolderOpen',
    path: '/projects',
    permission: 'project:read',
    children: [
      {
        id: 'projects-list',
        label: 'All Projects',
        icon: 'List',
        path: '/projects',
        permission: 'project:read'
      },
      {
        id: 'projects-kanban',
        label: 'Kanban Board',
        icon: 'Columns',
        path: '/projects/kanban',
        permission: 'project:read'
      },
      {
        id: 'projects-calendar',
        label: 'Calendar View',
        icon: 'Calendar',
        path: '/projects/calendar',
        permission: 'project:read'
      }
    ]
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: 'CheckSquare',
    path: '/tasks',
    permission: 'task:read',
    children: [
      {
        id: 'tasks-my',
        label: 'My Tasks',
        icon: 'User',
        path: '/tasks/my',
        permission: 'task:read'
      },
      {
        id: 'tasks-backlog',
        label: 'Backlog',
        icon: 'List',
        path: '/tasks/backlog',
        permission: 'task:read'
      },
      {
        id: 'tasks-sprints',
        label: 'Sprints',
        icon: 'Zap',
        path: '/tasks/sprints',
        permission: 'task:read'
      }
    ]
  },
  {
    id: 'team',
    label: 'Team',
    icon: 'Users',
    path: '/team',
    permission: 'team:read',
    children: [
      {
        id: 'team-members',
        label: 'Members',
        icon: 'Users',
        path: '/team/members',
        permission: 'team:read'
      },
      {
        id: 'team-roles',
        label: 'Roles & Permissions',
        icon: 'Shield',
        path: '/team/roles',
        permission: 'user:manage_roles'
      }
    ]
  },
  {
    id: 'time',
    label: 'Time Tracking',
    icon: 'Clock',
    path: '/time-tracking',
    permission: 'time_tracking:read',
    children: [
      {
        id: 'time-tracker',
        label: 'Timer',
        icon: 'Play',
        path: '/time-tracking/timer',
        permission: 'time_tracking:create'
      },
      {
        id: 'time-logs',
        label: 'Time Logs',
        icon: 'Clock',
        path: '/time-tracking/logs',
        permission: 'time_tracking:read'
      },
      {
        id: 'time-reports',
        label: 'Reports',
        icon: 'BarChart',
        path: '/time-tracking/reports',
        permission: 'time_tracking:read'
      }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'BarChart',
    path: '/reports',
    permission: 'reporting:read',
    children: [
      {
        id: 'reports-project',
        label: 'Project Reports',
        icon: 'FolderOpen',
        path: '/reports/projects',
        permission: 'reporting:read'
      },
      {
        id: 'reports-financial',
        label: 'Financial Reports',
        icon: 'DollarSign',
        path: '/reports/financial',
        permission: 'financial:read'
      },
      {
        id: 'reports-team',
        label: 'Team Reports',
        icon: 'Users',
        path: '/reports/team',
        permission: 'reporting:read'
      }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    path: '/settings',
    permission: 'settings:read',
    children: [
      {
        id: 'settings-profile',
        label: 'Profile',
        icon: 'User',
        path: '/settings/profile',
        permission: 'settings:read'
      },
      {
        id: 'settings-preferences',
        label: 'Preferences',
        icon: 'Sliders',
        path: '/settings/preferences',
        permission: 'settings:read'
      },
      {
        id: 'settings-notifications',
        label: 'Notifications',
        icon: 'Bell',
        path: '/settings/notifications',
        permission: 'settings:read'
      }
    ]
  }
];
```

### Sidebar Component Implementation
```typescript
// components/layout/Sidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronLeft, 
  ChevronRight,
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  Users,
  Clock,
  BarChart,
  Settings
} from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/lib/navigation/navigation-config';
import { useUserPermissions } from '@/hooks/useUserPermissions';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userPreferences, setUserPreferences] = useState(null);
  const pathname = usePathname();
  const { hasPermission } = useUserPermissions();

  // Load user preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/user/preferences');
        const preferences = await response.json();
        setUserPreferences(preferences);
        setIsCollapsed(preferences.sidebarCollapsed || false);
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      }
    };

    loadPreferences();
  }, []);

  // Save sidebar state
  const toggleSidebar = async () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidebarCollapsed: newState }),
      });
    } catch (error) {
      console.error('Failed to save sidebar preference:', error);
    }
  };

  // Filter navigation items based on permissions
  const filteredItems = NAVIGATION_ITEMS.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r bg-background transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Sidebar Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-lg">Kanvaro</span>
          </div>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Navigation Items */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="space-y-1">
          {filteredItems.map((item) => (
            <NavigationItem
              key={item.id}
              item={item}
              isCollapsed={isCollapsed}
              pathname={pathname}
            />
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}

interface NavigationItemProps {
  item: NavigationItem;
  isCollapsed: boolean;
  pathname: string;
}

function NavigationItem({ item, isCollapsed, pathname }: NavigationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isActive = pathname === item.path;
  const hasChildren = item.children && item.children.length > 0;

  const iconMap = {
    LayoutDashboard,
    FolderOpen,
    CheckSquare,
    Users,
    Clock,
    BarChart,
    Settings,
    List: List,
    Columns: Columns,
    Calendar: Calendar,
    User: User,
    Zap: Zap,
    Shield: Shield,
    Play: Play,
    Bell: Bell,
    DollarSign: DollarSign,
    Sliders: Sliders,
  };

  const Icon = iconMap[item.icon as keyof typeof iconMap];

  return (
    <div className="space-y-1">
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start',
          isCollapsed ? 'px-2' : 'px-3',
          isActive && 'bg-secondary text-secondary-foreground'
        )}
        onClick={() => {
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <Icon className={cn('h-4 w-4', isCollapsed ? 'mx-auto' : 'mr-2')} />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="ml-2 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">
                {item.badge}
              </span>
            )}
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            )}
          </>
        )}
      </Button>

      {/* Sub-navigation */}
      {hasChildren && isExpanded && !isCollapsed && (
        <div className="ml-4 space-y-1">
          {item.children!.map((child) => (
            <Button
              key={child.id}
              variant={pathname === child.path ? 'secondary' : 'ghost'}
              className="w-full justify-start text-sm"
              onClick={() => {
                // Navigate to child path
                window.location.href = child.path;
              }}
            >
              <Icon className="mr-2 h-4 w-4" />
              {child.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Header Component

### Header Implementation
```typescript
// components/layout/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import { Search, Bell, User, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { notifications, unreadCount } = useNotifications();

  // Global search functionality
  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const results = await response.json();
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4">
      {/* Global Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects, tasks, users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchOpen(true)}
            className="pl-10"
          />
          
          {/* Search Results Dropdown */}
          {isSearchOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-background shadow-lg">
              {searchResults.length > 0 ? (
                <div className="p-2">
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-3 rounded-sm px-3 py-2 hover:bg-accent cursor-pointer"
                      onClick={() => {
                        window.location.href = result.url;
                        setIsSearchOpen(false);
                      }}
                    >
                      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {result.type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{result.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {result.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No results found
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center space-x-2">
        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {theme === 'light' ? (
                <Sun className="h-4 w-4" />
              ) : theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Notifications</h4>
                <Button variant="ghost" size="sm">
                  Mark All as Read
                </Button>
              </div>
              <div className="space-y-2">
                {notifications.slice(0, 5).map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-start space-x-3 rounded-lg p-2 hover:bg-accent"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {notification.type.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {notification.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

## Main Content Area

### Layout Container
```typescript
// components/layout/MainLayout.tsx
'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar 
        className={sidebarCollapsed ? 'w-16' : 'w-64'}
        onCollapseChange={setSidebarCollapsed}
      />
      
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

## Responsive Design

### Mobile Navigation
```typescript
// components/layout/MobileNavigation.tsx
'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { NAVIGATION_ITEMS } from '@/lib/navigation/navigation-config';

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <div className="flex h-full flex-col">
          {/* Mobile Navigation Content */}
          <div className="flex-1 overflow-y-auto">
            <nav className="space-y-2 p-4">
              {NAVIGATION_ITEMS.map((item) => (
                <MobileNavigationItem
                  key={item.id}
                  item={item}
                  onNavigate={() => setIsOpen(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface MobileNavigationItemProps {
  item: NavigationItem;
  onNavigate: () => void;
}

function MobileNavigationItem({ item, onNavigate }: MobileNavigationItemProps) {
  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={() => {
        window.location.href = item.path;
        onNavigate();
      }}
    >
      <span>{item.label}</span>
    </Button>
  );
}
```

## User Preferences

### Preferences Management
```typescript
// lib/preferences/user-preferences.ts
export interface UserPreferences {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    inApp: boolean;
    push: boolean;
  };
  dashboard: {
    layout: 'grid' | 'list';
    widgets: string[];
  };
  timeTracking: {
    autoStart: boolean;
    reminders: boolean;
  };
}

export class UserPreferencesService {
  static async getPreferences(userId: string): Promise<UserPreferences> {
    const response = await fetch(`/api/user/preferences`);
    return response.json();
  }

  static async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): Promise<void> {
    await fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    });
  }

  static async resetPreferences(userId: string): Promise<void> {
    await fetch('/api/user/preferences', {
      method: 'DELETE',
    });
  }
}
```

## Theme Management

### Theme Hook
```typescript
// hooks/useTheme.ts
'use client';

import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }

    localStorage.setItem('theme', theme);
  }, [theme]);

  return { theme, setTheme };
}
```

---

*This application layout documentation will be updated as new navigation features are added and UX patterns evolve.*
