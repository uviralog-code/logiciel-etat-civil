// Préparation commune des tests d'écrans : un peu plus de patience pour les
// attentes (findBy…, waitFor) quand la machine est chargée (compilation en parallèle).
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 4000 });
