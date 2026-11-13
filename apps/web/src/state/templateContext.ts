import { wardrobeTemplate, type Template } from '@dafna/engine';
import { createContext, useContext } from 'react';

/**
 * D-8: the template of the product being configured (wardrobe, office pedestal, desk). The
 * configurator provides it; steps, option availability, toasts and the staff panel read their
 * parameters from it instead of a fixed wardrobe template.
 */
export const TemplateContext = createContext<Template>(wardrobeTemplate);

export function useTemplate(): Template {
  return useContext(TemplateContext);
}
