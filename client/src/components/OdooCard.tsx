interface OdooCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  color?: 'white' | 'yellow' | 'purple' | 'mint' | 'pink' | 'blue';
}

const colorMap = {
  white: 'bg-white',
  yellow: 'bg-[#FFD93D]',
  purple: 'bg-[#C4B5FD]',
  mint: 'bg-[#A7F3D0]',
  pink: 'bg-[#FBCFE8]',
  blue: 'bg-[#93C5FD]',
};

export default function OdooCard({ title, description, children, className = "", color = 'white' }: OdooCardProps) {
  return (
    <div 
      className={`rounded-2xl p-6 transition-all duration-200 ${colorMap[color]} ${className}`}
      style={{ border: '3px solid #000' }}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-xl font-bold text-black">{title}</h3>
          )}
          {description && (
            <p className="text-sm font-medium text-gray-600 mt-1">{description}</p>
          )}
        </div>
      )}
      <div>
        {children}
      </div>
    </div>
  );
}
