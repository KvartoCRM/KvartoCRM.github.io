import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import BrandLogo from './BrandLogo'

const BrandBootSplash = () => {
  const [visible, setVisible] = useState(true)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), reduceMotion ? 180 : 1150)
    return () => window.clearTimeout(timer)
  }, [reduceMotion])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="kvarto-boot fixed inset-0 z-[250] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.34, ease: 'easeOut' }}
          role="status"
          aria-label="KvartoCRM запускается"
        >
          <div className="kvarto-boot-orb kvarto-boot-orb-one" />
          <div className="kvarto-boot-orb kvarto-boot-orb-two" />
          <motion.div
            className="relative flex flex-col items-center"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={reduceMotion ? undefined : { y: [0, -5, 0], filter: ['drop-shadow(0 10px 30px rgba(63,99,245,.2))', 'drop-shadow(0 18px 44px rgba(107,56,243,.48))', 'drop-shadow(0 10px 30px rgba(63,99,245,.2))'] }}
              transition={{ duration: 1.65, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BrandLogo inverse markClassName="h-20 w-20" className="scale-110" />
            </motion.div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.34em] text-white/55">Ваш офис недвижимости</p>
            <div className="mt-8 h-1 w-36 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: reduceMotion ? 0.1 : 0.9, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default BrandBootSplash
