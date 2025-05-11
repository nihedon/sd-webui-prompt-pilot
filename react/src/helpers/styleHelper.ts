import { AppProps } from '@/types/props';
import { isVisible } from '@/utils/uiUtil';

export const setPosition = ({ offset_x, offset_y, x, y }: { offset_x: number; offset_y: number; x: number; y: number }) => ({
    top: `${offset_y}px`,
    left: `${offset_x}px`,
    transform: `translate(${x}px, ${y}px)`,
});

export const setDisplay = (state: AppProps) => (isVisible(state) ? {} : { display: 'none' });
