import * as m from 'motion/react-m';
import { reveal } from './motion.js';

export default function SectionHead({ title, lead, id }) {
  return (
    <m.div className="section-head" {...reveal()}>
      <h2 className="section-head__title" id={id}>{title}</h2>
      {lead && <p className="section-head__lead">{lead}</p>}
    </m.div>
  );
}
