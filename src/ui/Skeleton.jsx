/**
 * src/ui/Skeleton.jsx
 * Skeleton loading primitivo do design system Ranked.
 *
 * Promovido de App.jsx (função Sk + composições), com:
 * - Tokens do theme em vez de B3 hardcoded
 * - @keyframes via _inject.js (já tem reduced-motion guard)
 *
 * Uso:
 *   // Primitivo bruto
 *   <Skeleton width={200} height={14} radius={4}/>
 *   <Skeleton width="100%" height={40} radius={6}/>
 *
 *   // Composições prontas para as telas ainda não migradas
 *   <DashboardSkeleton/>
 *   <TableSkeleton rows={6}/>
 *   <PipelineSkeleton/>
 */

import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';

injectGlobalUI();

// ─── Primitivo ────────────────────────────────────────────

/**
 * @param {{ width?: number|string, height?: number, radius?: number, style?: object }} props
 */
export function Skeleton({ width = '100%', height = 14, radius = 6, style: extraStyle }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background:   t.color.neutral[200],
      animation:    'ranked-skeleton 1.6s ease-in-out infinite',
      flexShrink:   0,
      ...extraStyle,
    }}/>
  );
}

// Alias curto para uso interno das composições
const Sk = Skeleton;
const GAP = <div style={{ height: 8 }}/>;

// ─── Composições ──────────────────────────────────────────

const cardStyle = {
  background:   t.color.neutral[0],
  border:       t.border.thin,
  borderRadius: t.radius.lg,
  boxShadow:    t.shadow.xs,
};

export function DashboardSkeleton() {
  return (
    <div style={{ padding: t.space[6] }}>
      <Sk width={240} height={28} radius={6}/>{GAP}
      <Sk width={180} height={13} radius={4}/>
      <div style={{ height: t.space[8] }}/>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:t.space[3], marginBottom:t.space[6] }}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{ ...cardStyle, padding:`${t.space[4]} ${t.space[5]}` }}>
            <Sk width={80} height={10} radius={3}/><div style={{ height:10 }}/>
            <Sk width={120} height={24} radius={5}/><div style={{ height:6 }}/>
            <Sk width={100} height={11} radius={3}/>
          </div>
        ))}
      </div>

      {/* 2-col section */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:t.space[4] }}>
        {[0,1].map(i=>(
          <div key={i} style={{ ...cardStyle, padding:t.space[5] }}>
            <Sk width={140} height={13} radius={3}/><div style={{ height:14 }}/>
            {[0,1,2,3,4].map(j=>(
              <div key={j} style={{ display:'flex', alignItems:'center', gap:t.space[3], marginBottom:t.space[3] }}>
                <Sk width={8} height={8} radius="50%"/>
                <Sk width={160} height={12} radius={3}/>
                <div style={{ flex:1 }}/>
                <Sk width={48} height={11} radius={3}/>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: t.space[6] }}>
      <div style={{ ...cardStyle, overflow:'hidden' }}>
        {/* Header row */}
        <div style={{ padding:`${t.space[3]} ${t.space[4]}`, background:t.color.neutral[50],
          display:'flex', gap:t.space[6], borderBottom:t.border.thin }}>
          {[200,120,100,140,80].map((w,i)=><Sk key={i} width={w} height={11} radius={3}/>)}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ padding:`${t.space[4]} ${t.space[4]}`, display:'flex',
            gap:t.space[6], alignItems:'center',
            borderBottom: i < rows-1 ? t.border.thin : 'none' }}>
            <Sk width={12} height={12} radius="50%"/>
            <Sk width={180} height={13} radius={3}/>
            <Sk width={100} height={12} radius={3}/>
            <Sk width={80} height={12} radius={3}/>
            <div style={{ flex:1 }}/>
            <Sk width={60} height={11} radius={3}/>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div style={{ padding:t.space[6], overflowX:'auto' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8,minmax(160px,1fr))', gap:t.space[2], minWidth:1200 }}>
        {Array.from({ length: 8 }, (_, col) => (
          <div key={col} style={{ ...cardStyle, overflow:'hidden' }}>
            <div style={{ padding:`${t.space[3]} ${t.space[3]}`, borderBottom:t.border.thin, background:t.color.neutral[50] }}>
              <Sk width={80} height={11} radius={3}/>
            </div>
            <div style={{ padding:t.space[2], display:'flex', flexDirection:'column', gap:t.space[2] }}>
              {Array.from({ length: Math.floor(Math.random()*2)+1 }, (_, r) => (
                <div key={r} style={{ background:t.color.neutral[0], border:t.border.thin, borderRadius:t.radius.md, padding:t.space[3] }}>
                  <Sk width="80%" height={12} radius={3}/>
                  <div style={{ height:6 }}/>
                  <Sk width={60} height={10} radius={3}/>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
