import React from 'react';

export function Button({ children, variant = 'solid', className = '', ...props }) {
  const base =
    'px-4 py-2 rounded-full font-semibold focus:outline-none focus:ring-2';
  const variants = {
    solid: 'bg-green-600 text-white hover:bg-green-700',
    outline: 'border border-green-600 text-green-600 hover:bg-green-50'
  };
  return (
    <button
      className={`${base} ${variants[variant] || variants.solid} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
