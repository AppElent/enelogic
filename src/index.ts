export class C {
  private x = 10;
  public getX = () => this.x;
  public setX = (newVal: number) => {
    this.x = newVal;
  };
}

export let x = new C();
export let y = { ...{ some: 'value' } };


export function sum(a: number, b: number): number {

    return (a+b)
}