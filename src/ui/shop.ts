import { type Progression, UPGRADE_INFO } from '../logic/progression';
import { element } from './dom';

/** Upgrades screen: spend the gold earned in runs on permanent improvements of the dragon. */
export class ShopScreen {
  private readonly screen = element('shop');
  private readonly body = element('shop-body');
  private readonly gold = element('shop-gold');

  constructor(
    private readonly progression: Progression,
    private readonly onClose: () => void,
  ) {
    element('shop-close').addEventListener('click', () => this.close());
  }

  isOpen(): boolean {
    return !this.screen.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.screen.classList.remove('hidden');
  }

  close(): void {
    this.screen.classList.add('hidden');
    this.onClose();
  }

  private render(): void {
    this.gold.textContent = `Trésor : ${this.progression.gold} pièces d’or`;
    this.body.replaceChildren(
      ...UPGRADE_INFO.map(({ id, name, effect }) => {
        const card = document.createElement('article');
        card.className = 'upgrade';
        const rank = this.progression.rank(id);
        const max = this.progression.maxRank(id);
        const cost = this.progression.nextCost(id);
        const title = document.createElement('h3');
        title.textContent = name;
        const description = document.createElement('p');
        description.textContent = effect;
        const pips = document.createElement('div');
        pips.className = 'upgrade-pips';
        pips.setAttribute('aria-label', `Rang ${rank} sur ${max}`);
        for (let i = 0; i < max; i++) {
          const pip = document.createElement('span');
          pip.className = i < rank ? 'pip is-on' : 'pip';
          pips.append(pip);
        }
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'cta upgrade-buy';
        buy.textContent = cost === null ? 'Complet' : `Acheter · ${cost} or`;
        buy.disabled = cost === null || cost > this.progression.gold;
        buy.addEventListener('click', () => {
          this.progression.buy(id);
          this.render();
        });
        card.append(title, description, pips, buy);
        return card;
      }),
    );
  }
}
