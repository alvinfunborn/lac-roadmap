interface Props {
  tabs: string[];
  activeKey: string;
  onChange: (k: string) => void;
  onAdd?: () => void;
}

export default function DateTabs({ tabs, activeKey, onChange, onAdd }: Props) {
  return (
    <div className="lac-row lac-mb-8 lac-flex-wrap">
      {tabs.map(k => (
        <button key={k} className={`lac-btn lac-tab ${k === activeKey ? 'active' : ''}`} onClick={() => onChange(k)}>{k}</button>
      ))}
      {onAdd && <button className="lac-btn" onClick={onAdd}>+ 加一天</button>}
    </div>
  );
}


