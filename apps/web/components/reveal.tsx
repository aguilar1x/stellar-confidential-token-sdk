"use client";

import { motion, type Variants } from "framer-motion";

const easeOutExpo = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOutExpo } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

/**
 * Section-level reveal.
 *
 * `once: true` on purpose. Re-animating on scroll back looks livelier, but it
 * means content returns to opacity 0 whenever it leaves the viewport — so
 * scrolling quickly, or landing mid-page, can show a blank screen for a beat.
 * On a page whose entire job is to be believed by someone skimming it once,
 * that is a bad trade.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -60px 0px" }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1, margin: "0px 0px -60px 0px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
