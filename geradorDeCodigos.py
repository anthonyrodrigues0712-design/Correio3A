import random

lista1 = []
lista2 = []
lista3 = []

for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista1:
        lista1.append(f"LOVE-{cod}")

for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"PLUS-{cod}")


for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"TEAMO-{cod}")


for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"PRO-{cod}")


for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"AMAR-{cod}")


for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"MAX-{cod}")

for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"PROMAX-{cod}")


for i in range(300):
    cod = random.randint(1111, 9999)
    if cod not in lista2:
        lista2.append(f"ULTRA-{cod}")


for a in lista2:
    print(f"{a},")