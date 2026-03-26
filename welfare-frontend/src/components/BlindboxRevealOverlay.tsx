import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

export type BlindboxRevealStage =
  | 'idle'
  | 'charging'
  | 'suspense'
  | 'reveal'
  | 'resolved'
  | 'error';

export interface BlindboxRevealData {
  title: string;
  reward_balance: number;
  new_balance: number | null;
}

interface BlindboxRevealOverlayProps {
  open: boolean;
  stage: BlindboxRevealStage;
  data: BlindboxRevealData | null;
  message: string;
  canSkip: boolean;
  demoMode?: boolean;
  onSkip: () => void;
  onClose: () => void;
}

function useAnimatedNumber(target: number, active: boolean) {
  const [value, setValue] = useState(active ? 0 : target);

  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 860;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(target * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return Math.round(value * 100) / 100;
}

function getRevealTone(amount: number | null) {
  if (amount == null) {
    return 'normal';
  }
  if (amount >= 25) {
    return 'jackpot';
  }
  if (amount >= 15) {
    return 'lucky';
  }
  return 'normal';
}

export function BlindboxRevealOverlay({
  open,
  stage,
  data,
  message,
  canSkip,
  demoMode = false,
  onSkip,
  onClose
}: BlindboxRevealOverlayProps) {
  const tone = getRevealTone(data?.reward_balance ?? null);
  const animatedAmount = useAnimatedNumber(
    data?.reward_balance ?? 0,
    stage === 'reveal' || stage === 'resolved'
  );
  const particles = useMemo(() => Array.from({ length: 14 }, (_, index) => index), []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="blindbox-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="blindbox-overlay-backdrop" />

          <motion.div
            className={`blindbox-overlay-panel ${tone} stage-${stage}`}
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.97 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="blindbox-overlay-noise" />
            <div className="blindbox-overlay-orbit blindbox-overlay-orbit-a" />
            <div className="blindbox-overlay-orbit blindbox-overlay-orbit-b" />
            {particles.map((particle) => (
              <span
                key={particle}
                className="blindbox-overlay-particle"
                style={{
                  ['--particle-index' as string]: particle,
                  ['--particle-offset' as string]: `${(particle % 7) * 14}%`
                }}
              />
            ))}

            <div className="blindbox-overlay-head">
              <span className="blindbox-overlay-kicker">surprise check-in</span>
              {canSkip && stage !== 'resolved' && stage !== 'error' && (
                <button className="button ghost blindbox-overlay-skip" onClick={onSkip}>
                  跳过演出
                </button>
              )}
            </div>

            <div className="blindbox-core-scene">
              <motion.div
                className="blindbox-core-shell"
                animate={
                  stage === 'charging'
                    ? { scale: [1, 1.05, 1], rotate: [0, -2, 2, 0] }
                    : stage === 'suspense'
                      ? { scale: [1, 1.08, 1.03, 1], rotate: [0, 2, -2, 0] }
                      : stage === 'reveal' || stage === 'resolved'
                        ? { scale: [1, 1.12, 1], rotate: [0, 0, 0] }
                        : { scale: 1, rotate: 0 }
                }
                transition={{ duration: stage === 'suspense' ? 1.2 : 0.72, repeat: stage === 'resolved' ? 0 : Infinity }}
              >
                <div className="blindbox-core-glow" />
                <div className="blindbox-core-box">
                  <div className="blindbox-core-lid" />
                  <div className="blindbox-core-body">
                    <span>LUCK</span>
                  </div>
                </div>
              </motion.div>

              {(stage === 'reveal' || stage === 'resolved') && data && (
                <motion.div
                  className="blindbox-reveal-card"
                  initial={{ opacity: 0, y: 24, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="blindbox-reveal-label">{demoMode ? '演示签文' : '今日签文'}</span>
                  <strong>{data.title}</strong>
                  <div className="blindbox-reveal-amount">+{animatedAmount.toFixed(2)}</div>
                  <p>
                    {demoMode
                      ? '管理员演示模式：不会写入签到记录，也不会发放奖励'
                      : data.new_balance != null
                        ? `奖励已入账，当前余额 ${data.new_balance}`
                        : '奖励已发放，本次未返回最新余额'}
                  </p>
                </motion.div>
              )}
            </div>

            <div className="blindbox-overlay-copy">
              <h2>
                {stage === 'charging' && '幸运引擎启动中'}
                {stage === 'suspense' && '签文正在凝结'}
                {stage === 'reveal' && '今日惊喜揭晓'}
                {stage === 'resolved' && (demoMode ? '演示结果已揭晓' : '好运已经落袋')}
                {stage === 'error' && (demoMode ? '演示未能启动' : '盲盒暂未开启成功')}
              </h2>
              <p>{message}</p>
            </div>

            {(stage === 'resolved' || stage === 'error') && (
              <div className="blindbox-overlay-actions">
                <button className="button primary wide" onClick={onClose}>
                  {stage === 'resolved'
                    ? demoMode
                      ? '结束演示'
                      : '收下今日好运'
                    : '返回签到页'}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
