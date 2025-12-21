import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface OdooCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export default function OdooCard({ title, description, children, className = "" }: OdooCardProps) {
  return (
    <Card className={`modern-card ${className}`}>
      {(title || description) && (
        <CardHeader className="pb-4">
          {title && (
            <CardTitle className="heading-sm">{title}</CardTitle>
          )}
          {description && (
            <CardDescription className="body-sm text-gray-600 mt-1">{description}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className={title || description ? "pt-0" : ""}>
        {children}
      </CardContent>
    </Card>
  );
}
