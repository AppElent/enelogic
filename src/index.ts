export { default } from './Enelogic';

export class C {
  private x = 10;
  public getX = (): number => this.x;
  public setX = (newVal: number): void => {
    this.x = newVal;
  };
}

export const x = new C();
export const y = { ...{ some: 'value' } };

export function sum(a: number, b: number): number {
  return a + b;
}
