import requests

icons = [
    # Finance
    'credit-card', 'trending-down', 'piggy-bank', 'percent',
    # Food & Drink
    'coffee', 'pizza', 'glass-water', 'beer', 'cup-soda', 'cake', 'clover',
    # Transport
    'bus', 'plane', 'bike', 'fuel', 'train', 'ship', 'map-pin',
    # Shopping
    'gift', 'shirt', 'watch',
    # Home
    'droplets', 'wifi', 'tv', 'refrigerator',
    # Lifestyle
    'music', 'ticket', 'gamepad-2', 'camera', 'book', 'palette', 'briefcase',
    # Health
    'heart', 'pill', 'activity', 'dumbbell', 'baby',
    # Other
    'pin', 'star', 'bookmark', 'bell', 'flag', 'help-circle',
    # Utils
    'arrow-up-down'
]

results = {}
for icon in icons:
    url = f"https://cdn.jsdelivr.net/npm/lucide-static@0.400.0/icons/{icon}.svg"
    try:
        r = requests.get(url)
        if r.status_code == 200:
            results[icon] = r.text.replace('\n', '').replace('  ', ' ')
        else:
            print(f"Failed to fetch {icon}: {r.status_code}")
    except Exception as e:
        print(f"Error fetching {icon}: {e}")

with open('icons.txt', 'w') as f:
    for name, svg in results.items():
        f.write(f"'{name}': '{svg}',\n")