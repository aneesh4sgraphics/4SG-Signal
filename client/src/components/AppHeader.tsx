import React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import logoImage from "@assets/4s logo Clean High res_1752588087394.jpg";

export default function AppHeader() {
  const { user } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
            <img 
              src={logoImage} 
              alt="4S Graphics Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Employee Portal</h1>
            <p className="text-sm text-gray-600 hidden sm:block">Your Gateway to Fast Quotes & Solutions</p>
          </div>
        </Link>

        {/* User Info and Navigation */}
        <div className="flex items-center space-x-4">
          {/* User Info - Hidden on mobile */}
          <div className="hidden sm:flex items-center space-x-2">
            <User className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-700">
              {user?.email || 'Loading...'}
              {user?.role === 'admin' && (
                <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  (admin)
                </span>
              )}
            </span>
          </div>

          {/* Admin Dropdown */}
          {user?.role === 'admin' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                  <Settings className="h-4 w-4 mr-1" />
                  Admin
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/admin" className="w-full">
                    <Settings className="h-4 w-4 mr-2" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/api/logout'}
            className="text-gray-600 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}