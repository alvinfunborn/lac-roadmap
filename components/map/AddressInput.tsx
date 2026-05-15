import React from 'react';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onMapClick: () => void;
  placeholder?: string;
  className?: string;
}

export default function AddressInput({
  value,
  onChange,
  onMapClick,
  placeholder = '点击选择地址',
  className = ''
}: AddressInputProps) {
  return (
    <div className={`lac-address-input-group ${className}`}>
      <input
        type='text'
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onClick={onMapClick}
        className='lac-address-input lac-address-input-clickable'
        readOnly
      />
    </div>
  );
}

